import { Client } from "pg";

function cors(request){
  return {
    "Access-Control-Allow-Origin":"*",
    "Access-Control-Allow-Methods":"GET,POST,PUT,PATCH,DELETE,OPTIONS",
    "Access-Control-Allow-Headers":"Content-Type, Authorization, X-Admin-Key",
    "Access-Control-Max-Age":"86400",
    "Content-Type":"application/json; charset=utf-8",
    "X-Robots-Tag":"noindex, nofollow",
    "Cache-Control":"no-store, no-cache, must-revalidate"
  };
}
function json(request,data,status=200){return new Response(JSON.stringify(data),{status,headers:cors(request)})}
function clean(v){return String(v??"").trim()}
function adminOK(request,env){
  const bearer=(request.headers.get("Authorization")||"").replace(/^Bearer\s+/i,"").trim();
  const key=request.headers.get("X-Admin-Key")||bearer;
  return !!env.ADMIN_API_KEY && key===env.ADMIN_API_KEY;
}
function requireAdmin(request,env){return adminOK(request,env)?null:json(request,{success:false,message:"Unauthorized"},401)}
function memberStatusText(s){s=String(s||'').toLowerCase().trim();if(['active','ใช้งาน','approved','สมาชิกสมบูรณ์'].includes(s))return'active';if(['review','รอตรวจสอบข้อมูล','รอตรวจสอบการชำระ','pending_review'].includes(s))return'review';if(['payment_pending','pending','รอชำระค่าสนับสนุน','รอชำระค่าสมาชิก','รออนุมัติ'].includes(s))return'payment_pending';if(['cancelled','canceled','rejected','ยกเลิก','ไม่อนุมัติ'].includes(s))return'cancelled';if(['renewal','รอต่ออายุ','รอต่ออายุสมาชิก','ต่ออายุสมาชิก'].includes(s))return'renewal';return'payment_pending'}
function effectiveMemberStatus(m){
  const base=memberStatusText(m?.status);
  if(base==="active" && m?.member_expire){
    const exp=new Date(m.member_expire);
    if(!Number.isNaN(exp.getTime()) && exp.getTime()<=Date.now()) return "renewal";
  }
  return base;
}
function id(prefix){return `${prefix}-${Date.now()}-${crypto.randomUUID().slice(0,8)}`}
async function body(request){try{return await request.json()}catch{return {}}}
function db(env){
  if(!env?.HYPERDRIVE?.connectionString) throw new Error("HYPERDRIVE binding is missing");

  const client = new Client({
    connectionString: env.HYPERDRIVE.connectionString
  });
  let connected = false;

  async function connect(){
    if(!connected){
      await client.connect();
      connected = true;
    }
  }

  async function run(strings,...values){
    await connect();
    const queryText = strings.reduce(
      (sql,part,i) => sql + part + (i < values.length ? `$${i+1}` : ""),
      ""
    );
    const result = await client.query(queryText,values);
    return result.rows;
  }

  run.begin = async function(callback){
    await connect();
    await client.query("BEGIN");
    try{
      const result = await callback(run);
      await client.query("COMMIT");
      return result;
    }catch(error){
      await client.query("ROLLBACK").catch(()=>{});
      throw error;
    }
  };

  run.end = async function(){
    if(connected){
      connected = false;
      await client.end();
    }
  };

  return run;
}


async function ensureNewsSchema(sql){
  await sql`CREATE TABLE IF NOT EXISTS news (news_id VARCHAR(80) PRIMARY KEY,category VARCHAR(30) NOT NULL DEFAULT 'ข่าวสาร',title VARCHAR(300) NOT NULL,content TEXT NOT NULL,publish_date TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,active BOOLEAN NOT NULL DEFAULT TRUE,created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP)`;
  await sql`ALTER TABLE news ADD COLUMN IF NOT EXISTS image_data TEXT`;
  await sql`ALTER TABLE news ADD COLUMN IF NOT EXISTS image_name TEXT`;
  await sql`ALTER TABLE news ADD COLUMN IF NOT EXISTS featured BOOLEAN NOT NULL DEFAULT FALSE`;
  await sql`CREATE INDEX IF NOT EXISTS idx_news_publish_date ON news(publish_date DESC)`;
}
function newsImages(v){
  if(!v)return [];
  const t=String(v||'').trim();
  if(t.startsWith('[')){
    try{const a=JSON.parse(t);return Array.isArray(a)?a.filter(Boolean):[]}catch{return []}
  }
  return [t];
}
function newsImageOK(v){
  const imgs=newsImages(v);
  if(!imgs.length)return true;
  if(imgs.length>10)return false;
  let total=0;
  for(const img of imgs){
    const t=String(img||'');
    if(!/^data:image\/(jpeg|jpg|png|webp);base64,/i.test(t))return false;
    // Client compresses automatically. Limit each stored image and the complete gallery separately.
    if(t.length>900000)return false;
    total+=t.length;
  }
  return total<=7000000;
}

async function ensureMediaSchema(sql){
  await sql`CREATE TABLE IF NOT EXISTS media_library (media_id TEXT PRIMARY KEY,file_name TEXT NOT NULL,category TEXT NOT NULL DEFAULT 'ข่าวสาร',mime_type TEXT,image_data TEXT NOT NULL,size_bytes INTEGER NOT NULL DEFAULT 0,created_by TEXT,created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW())`;
  await sql`CREATE INDEX IF NOT EXISTS idx_media_library_created ON media_library(created_at DESC)`;
}
function mediaImageOK(v){
  const t=String(v||'');
  return /^data:image\/(jpeg|jpg|png|webp);base64,/i.test(t) && t.length<=900000;
}

async function ensureAccountingSchema(sql){
  await sql`CREATE TABLE IF NOT EXISTS ledger_entries (entry_id TEXT PRIMARY KEY,entry_date TIMESTAMPTZ NOT NULL DEFAULT NOW(),entry_type TEXT NOT NULL,category TEXT,source TEXT,amount NUMERIC(12,2) NOT NULL DEFAULT 0,reference_type TEXT,reference_id TEXT,member_code TEXT,description TEXT,note TEXT,created_by TEXT,status TEXT NOT NULL DEFAULT 'posted',created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW())`;
  await sql`ALTER TABLE ledger_entries ADD COLUMN IF NOT EXISTS attachment_data TEXT`;
  await sql`ALTER TABLE ledger_entries ADD COLUMN IF NOT EXISTS attachment_name TEXT`;
  await sql`ALTER TABLE ledger_entries ADD COLUMN IF NOT EXISTS attachment_type TEXT`;
  await sql`CREATE INDEX IF NOT EXISTS idx_ledger_entries_date ON ledger_entries(entry_date DESC,created_at DESC)`;
  await sql`CREATE INDEX IF NOT EXISTS idx_ledger_entries_reference ON ledger_entries(reference_type,reference_id)`;
  await sql`CREATE TABLE IF NOT EXISTS ledger_admin_logs (log_id TEXT PRIMARY KEY,entry_id TEXT,action TEXT NOT NULL,detail TEXT,old_data JSONB,new_data JSONB,admin_by TEXT,created_at TIMESTAMPTZ NOT NULL DEFAULT NOW())`;
  await sql`CREATE INDEX IF NOT EXISTS idx_ledger_admin_logs_entry_created ON ledger_admin_logs(entry_id,created_at DESC)`;
}

async function ensureMemberAdminSchema(sql){
  await sql`CREATE TABLE IF NOT EXISTS member_admin_logs (log_id TEXT PRIMARY KEY,member_code TEXT,action TEXT NOT NULL,detail TEXT,old_data JSONB,new_data JSONB,admin_by TEXT,created_at TIMESTAMPTZ NOT NULL DEFAULT NOW())`;
  await sql`CREATE INDEX IF NOT EXISTS idx_member_admin_logs_member_code_created ON member_admin_logs(member_code,created_at DESC)`;
}

async function ensureV2616Schema(sql){
  // Additive / self-healing only: never deletes existing data.
  await sql`CREATE TABLE IF NOT EXISTS donation_topics (topic_id VARCHAR(50) PRIMARY KEY,title VARCHAR(200) NOT NULL,description TEXT,active BOOLEAN NOT NULL DEFAULT TRUE,created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP)`;
  await sql`CREATE TABLE IF NOT EXISTS payment_topics (topic_id VARCHAR(50) PRIMARY KEY,title VARCHAR(200) NOT NULL,description TEXT,amount NUMERIC(12,2),active BOOLEAN NOT NULL DEFAULT TRUE,created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP)`;
  await sql`ALTER TABLE payment_topics ADD COLUMN IF NOT EXISTS description TEXT`;
  await sql`ALTER TABLE payment_topics ADD COLUMN IF NOT EXISTS amount NUMERIC(12,2)`;
  await sql`ALTER TABLE payment_topics ADD COLUMN IF NOT EXISTS active BOOLEAN NOT NULL DEFAULT TRUE`;
  await sql`ALTER TABLE payment_topics ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP`;
  await sql`ALTER TABLE payment_topics ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP`;
  await sql`ALTER TABLE payments ADD COLUMN IF NOT EXISTS receipt_no TEXT`;
  await sql`ALTER TABLE payments ADD COLUMN IF NOT EXISTS receipt_issued_at TIMESTAMPTZ`;
  await sql`ALTER TABLE donations ADD COLUMN IF NOT EXISTS receipt_no TEXT`;
  await sql`ALTER TABLE donations ADD COLUMN IF NOT EXISTS receipt_issued_at TIMESTAMPTZ`;
  await sql`ALTER TABLE donations ADD COLUMN IF NOT EXISTS verified_by TEXT`;
  await sql`ALTER TABLE donations ADD COLUMN IF NOT EXISTS verified_at TIMESTAMPTZ`;
  await sql`ALTER TABLE donations ADD COLUMN IF NOT EXISTS address_line TEXT`;
  await sql`ALTER TABLE donations ADD COLUMN IF NOT EXISTS subdistrict TEXT`;
  await sql`ALTER TABLE donations ADD COLUMN IF NOT EXISTS district TEXT`;
  await sql`ALTER TABLE donations ADD COLUMN IF NOT EXISTS province TEXT`;
  await sql`ALTER TABLE donations ADD COLUMN IF NOT EXISTS postal_code TEXT`;
  await sql`CREATE TABLE IF NOT EXISTS receipt_print_logs (log_id TEXT PRIMARY KEY,batch_id TEXT,payment_id TEXT,receipt_no TEXT,print_type TEXT NOT NULL DEFAULT 'single',printed_by TEXT,printed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),user_agent TEXT)`;
  await sql`ALTER TABLE receipt_print_logs ADD COLUMN IF NOT EXISTS source_type TEXT NOT NULL DEFAULT 'payment'`;
  await sql`ALTER TABLE receipt_print_logs ADD COLUMN IF NOT EXISTS transaction_id TEXT`;
}

function photoOK(v){
  if(!v) return true;
  const t=String(v);
  return /^data:image\/(jpeg|jpg|webp);base64,/i.test(t) && t.length<=360000;
}
function slipOK(v){
  if(!v) return false;
  const t=String(v);
  return /^data:image\/(jpeg|jpg|png|webp);base64,/i.test(t) && t.length<=1400000;
}
function ledgerAttachmentOK(v){
  if(!v)return true;
  const t=String(v||'');
  return /^data:(image\/(jpeg|jpg|png|webp)|application\/pdf);base64,/i.test(t) && t.length<=2800000;
}

async function cardToken(code,env){
  const secret=clean(env?.ADMIN_API_KEY);
  if(!secret)return "";
  const enc=new TextEncoder();
  const key=await crypto.subtle.importKey("raw",enc.encode(secret),{name:"HMAC",hash:"SHA-256"},false,["sign"]);
  const sig=await crypto.subtle.sign("HMAC",key,enc.encode("member-card:"+String(code||"").toUpperCase()));
  return Array.from(new Uint8Array(sig)).map(b=>b.toString(16).padStart(2,"0")).join("");
}
function safeEqual(a,b){a=String(a||"");b=String(b||"");if(a.length!==b.length)return false;let x=0;for(let i=0;i<a.length;i++)x|=a.charCodeAt(i)^b.charCodeAt(i);return x===0}

export default {
  async fetch(request,env){
    if(request.method==="OPTIONS") return new Response(null,{status:204,headers:cors(request)});
    const url=new URL(request.url), path=url.pathname.replace(/\/+$/,"")||"/";
    let sql=null;
    try{
      if(path==="/") return json(request,{success:true,app:"SK Alumni API",version:"2.6.57",status:"online"});
      sql=db(env);
      if(path==="/api/health"&&request.method==="GET"){
        const r=await sql`SELECT current_database() database,NOW() server_time`;
        return json(request,{success:true,service:"sk-alumni-api",database:r[0].database,server_time:r[0].server_time,version:"2.6.57"});
      }

      if(path==="/api/settings/public"&&request.method==="GET"){
        const rows=await sql`SELECT setting_key,setting_value FROM app_settings WHERE setting_key IN ('APP_NAME','APP_VERSION','MEMBERSHIP_FEE_YEARLY','MEMBERSHIP_FEE_MONTHLY','PROMPTPAY','BANK_ACCOUNT_NAME','BANK_NAME','BANK_ACCOUNT_NO','CONTACT_EMAIL','ASSOCIATION_ADDRESS','HOME_QUOTE','HOME_QUOTE_BY','HOME_NEWS_TITLE') ORDER BY setting_key`;
        const data={};for(const r of rows)data[r.setting_key]=r.setting_value;data.APP_VERSION='V2.6.57';
        return json(request,{success:true,data});
      }

      if(path==="/api/payment-topics/public"&&request.method==="GET"){
        // Public page must never fail just because an older DB schema is still deployed.
        // Read settings first and fall back to the annual membership topic if topic-table access fails.
        const feeRows=await sql`SELECT setting_value FROM app_settings WHERE setting_key='MEMBERSHIP_FEE_YEARLY' LIMIT 1`;
        const fee=Number(feeRows[0]?.setting_value||0)||null;
        try{
          const rows=await sql`SELECT topic_id,title,description,amount FROM payment_topics WHERE active=TRUE ORDER BY title`;
          const mapped=(rows||[]).map(r=>r.topic_id==='membership'?{...r,title:'ค่าบำรุงสมาคมศิษย์เก่าฯ รายปี',description:r.description||'สนับสนุนสมาคมฯ รายปี',amount:fee??r.amount}:r);
          mapped.sort((a,b)=>a.topic_id==='membership'?-1:b.topic_id==='membership'?1:String(a.title||'').localeCompare(String(b.title||''),'th'));
          const seen=new Set(),normalized=[];for(const r of mapped){const k=String(r.title||'').replace(/\s+/g,'').trim();if(seen.has(k))continue;seen.add(k);normalized.push(r)}
          if(normalized.length)return json(request,{success:true,data:normalized});
        }catch(topicError){
          console.warn('payment-topics public fallback',topicError?.message||topicError);
        }
        return json(request,{success:true,data:[{topic_id:'membership',title:'ค่าบำรุงสมาคมศิษย์เก่าฯ รายปี',description:'สนับสนุนสมาคมฯ รายปี',amount:fee}]});
      }

      if(path==="/api/donation-topics/public"&&request.method==="GET"){
        try{const rows=await sql`SELECT topic_id,title,description FROM donation_topics WHERE active=TRUE ORDER BY title`;return json(request,{success:true,data:rows||[]})}catch(e){return json(request,{success:true,data:[]})}
      }

      if(path==="/api/members/register"&&request.method==="POST"){
        const b=await body(request);const prefix=clean(b.prefix),first=clean(b.first_name),last=clean(b.last_name),phone=clean(b.phone),email=clean(b.email).toLowerCase(),photo=clean(b.photo_data);
        if(!prefix||!first||!last||!/^\d{9,10}$/.test(phone))return json(request,{success:false,message:"ข้อมูลลงทะเบียนไม่ครบหรือเบอร์โทรไม่ถูกต้อง"},400);
        if(email&&!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))return json(request,{success:false,message:"รูปแบบอีเมลไม่ถูกต้อง"},400);
        if(!photoOK(photo))return json(request,{success:false,message:"รูปสมาชิกไม่ถูกต้องหรือมีขนาดใหญ่เกินกำหนด"},400);
        const dup=await sql`
          SELECT member_code
          FROM members
          WHERE LOWER(TRIM(COALESCE(first_name,'')))=LOWER(TRIM(${first}))
            AND LOWER(TRIM(COALESCE(last_name,'')))=LOWER(TRIM(${last}))
            AND LOWER(TRIM(COALESCE(email,'')))=LOWER(TRIM(${email}))
          LIMIT 1
        `;
        if(dup.length)return json(request,{success:false,duplicate:true,member_code:dup[0].member_code,message:"พบชื่อ นามสกุล และอีเมลนี้ลงทะเบียนไว้แล้ว"},409);
        const yy=String(new Date().getFullYear()+543).slice(-2);
        const seq=await sql`
          SELECT COALESCE(
            MAX(
              CASE
                WHEN member_code ~ ${'^'+yy+'-SK[0-9]{4}$'}
                THEN CAST(RIGHT(member_code,4) AS INTEGER)
                ELSE NULL
              END
            ),0
          ) + 1 AS n
          FROM members
          WHERE member_code LIKE ${yy+'-SK%'}
        `;
        const nextNo=Math.max(1,Number(seq[0]?.n||1));
        const code=`${yy}-SK${String(nextNo).padStart(4,'0')}`;
        const full=`${first} ${last}`.trim();
        await sql.begin(async tx=>{
          await tx`
            INSERT INTO members(
              member_code,prefix,first_name,last_name,full_name,arabic_name,
              email,phone,line_id,line_user_id,photo_data,status,consent,consent_at,
              registered_at,updated_at
            )
            VALUES(
              ${code},${prefix},${first},${last},${full},${clean(b.arabic_name)||null},
              ${email||null},${phone},${clean(b.line_id)||null},${clean(b.line_id)||null},
              ${photo||null},'payment_pending',TRUE,NOW(),NOW(),NOW()
            )
          `;
          await tx`INSERT INTO addresses(member_code,address_line,subdistrict,district,province,postal_code,updated_at) VALUES(${code},${clean(b.address_line)||null},${clean(b.subdistrict)||null},${clean(b.district)||null},${clean(b.province)||null},${clean(b.postal_code)||null},NOW()) ON CONFLICT(member_code) DO UPDATE SET address_line=EXCLUDED.address_line,subdistrict=EXCLUDED.subdistrict,district=EXCLUDED.district,province=EXCLUDED.province,postal_code=EXCLUDED.postal_code,updated_at=NOW()`;
        });
        return json(request,{success:true,message:"ลงทะเบียนเรียบร้อยแล้ว",member_code:code,data:{member_code:code,status:"payment_pending"}},201);
      }

      if(/^\/api\/status\//.test(path)&&request.method==="GET"){
        const code=decodeURIComponent(path.split('/').pop()).toUpperCase();
        const rows=await sql`SELECT member_code,prefix,first_name,last_name,full_name,arabic_name,status,registered_at,member_start,member_expire FROM members WHERE member_code=${code} LIMIT 1`;
        if(!rows.length)return json(request,{success:true,found:false,message:"ไม่พบข้อมูลสมาชิก"},404);
        return json(request,{success:true,found:true,data:{...rows[0],status:memberStatusText(rows[0].status)}});
      }

      if(path==="/api/member/login"&&request.method==="POST"){
        const b=await body(request);const code=clean(b.member_code).toUpperCase(),identity=clean(b.identity).toLowerCase();
        const rows=await sql`SELECT m.member_code,m.prefix,m.first_name,m.last_name,m.full_name,m.arabic_name,m.status,m.email,m.phone,m.photo_data,m.member_start,m.member_expire,a.address_line,a.subdistrict,a.district,a.province,a.postal_code FROM members m LEFT JOIN addresses a ON a.member_code=m.member_code WHERE m.member_code=${code} LIMIT 1`;
        if(!rows.length)return json(request,{success:false,message:"ไม่พบข้อมูลสมาชิก"},404);const m=rows[0];
        { const eff=effectiveMemberStatus(m); if(eff!=="active")return json(request,{success:false,message:eff==="renewal"?"สมาชิกอยู่ในสถานะรอต่ออายุสมาชิก กรุณาชำระค่าบำรุงสมาชิกรายปี":"สมาชิกยังไม่อยู่ในสถานะใช้งาน",status:eff},403); }
        const ok=(m.email&&String(m.email).toLowerCase()===identity)||(m.phone&&String(m.phone).replace(/\D/g,'')===identity.replace(/\D/g,''));
        if(!ok)return json(request,{success:false,message:"อีเมลหรือเบอร์โทรไม่ตรงกับข้อมูลสมาชิก"},401);
        return json(request,{success:true,data:{member_code:m.member_code,prefix:m.prefix,first_name:m.first_name,last_name:m.last_name,full_name:m.full_name,arabic_name:m.arabic_name,status:"active",phone:m.phone,email:m.email,photo_data:m.photo_data,member_start:m.member_start,member_expire:m.member_expire,address:{address_line:m.address_line,subdistrict:m.subdistrict,district:m.district,province:m.province,postal_code:m.postal_code}}});
      }


      if(path==="/api/member/portal"&&request.method==="POST"){
        const b=await body(request);
        const code=clean(b.member_code).toUpperCase(),identity=clean(b.identity).toLowerCase();
        if(!code||!identity)return json(request,{success:false,message:"กรุณากรอกรหัสสมาชิกและอีเมลหรือเบอร์โทรศัพท์"},400);

        const rows=await sql`
          SELECT m.member_code,m.prefix,m.first_name,m.last_name,m.full_name,m.arabic_name,m.status,
                 m.email,m.phone,m.photo_data,m.member_start,m.member_expire,m.registered_at,
                 a.address_line,a.subdistrict,a.district,a.province,a.postal_code
          FROM members m
          LEFT JOIN addresses a ON a.member_code=m.member_code
          WHERE m.member_code=${code}
          LIMIT 1
        `;
        if(!rows.length)return json(request,{success:false,message:"ไม่พบข้อมูลสมาชิก"},404);
        const m=rows[0];
        { const eff=effectiveMemberStatus(m); if(eff!=="active")return json(request,{success:false,message:eff==="renewal"?"สมาชิกอยู่ในสถานะรอต่ออายุสมาชิก กรุณาชำระค่าบำรุงสมาชิกรายปี":"สมาชิกยังไม่อยู่ในสถานะใช้งาน",status:eff},403); }
        const normPhone=v=>String(v||"").replace(/\D/g,"");
        const ok=(m.email&&String(m.email).toLowerCase()===identity)||(m.phone&&normPhone(m.phone)===normPhone(identity));
        if(!ok)return json(request,{success:false,message:"อีเมลหรือเบอร์โทรไม่ตรงกับข้อมูลสมาชิก"},401);

        // Portal V2.6.5: โมดูลประวัติแต่ละส่วนต้องไม่ทำให้ทั้ง Portal ล่ม
        let payments=[],donations=[],usages=[],benefits=[],editHistory=[];
        const moduleWarnings=[];

        try{
          payments=await sql`
            SELECT payment_id,payment_type,amount,paid_at,status,note
            FROM payments
            WHERE member_code=${code}
            ORDER BY paid_at DESC,created_at DESC
            LIMIT 200
          `;
        }catch(e){
          console.error("Member Portal payments module",e);
          moduleWarnings.push("payments");
        }

        try{
          donations=await sql`
            SELECT donation_id,amount,donated_at,status,note
            FROM donations
            WHERE member_code=${code}
            ORDER BY donated_at DESC,created_at DESC
            LIMIT 200
          `;
        }catch(e){
          console.error("Member Portal donations module",e);
          moduleWarnings.push("donations");
        }

        // benefit_usage เป็นโมดูลเสริม: V2.6 schema บางฐานยังไม่มีตารางนี้
        try{
          const exists=await sql`SELECT to_regclass('public.benefit_usage') AS table_name`;
          if(exists[0]?.table_name){
            usages=await sql`
              SELECT u.usage_id,u.benefit_id,bf.title,u.used_at,u.amount,u.note
              FROM benefit_usage u
              LEFT JOIN benefits bf ON bf.benefit_id=u.benefit_id
              WHERE u.member_code=${code}
              ORDER BY u.used_at DESC,u.created_at DESC
              LIMIT 200
            `;
          }
        }catch(e){
          console.error("Member Portal benefit usage module",e);
          moduleWarnings.push("benefit_usage");
          usages=[];
        }

        // ใช้เฉพาะ column ที่มีใน schema จริงของ benefits
        try{
          benefits=await sql`
            SELECT benefit_id,title,description,start_date,end_date
            FROM benefits
            WHERE active=TRUE
              AND (start_date IS NULL OR start_date<=CURRENT_DATE)
              AND (end_date IS NULL OR end_date>=CURRENT_DATE)
            ORDER BY created_at DESC
            LIMIT 100
          `;
        }catch(e){
          console.error("Member Portal benefits module",e);
          moduleWarnings.push("benefits");
          benefits=[];
        }

        try{
          const exists=await sql`SELECT to_regclass('public.member_edit_history') AS table_name`;
          if(exists[0]?.table_name){
            editHistory=await sql`
              SELECT edit_id,changed_fields,change_summary,source,old_data,new_data,changed_at
              FROM member_edit_history
              WHERE member_code=${code}
              ORDER BY changed_at DESC
              LIMIT 200
            `;
          }
        }catch(e){
          console.error("Member Portal edit history module",e);
          moduleWarnings.push("edit_history");
          editHistory=[];
        }

        const paymentApproved=x=>["ชำระแล้ว","อนุมัติ","approved","paid","verified"].includes(String(x.status||"").toLowerCase());
        const donationApproved=x=>["ตรวจสอบแล้ว","อนุมัติ","approved","verified"].includes(String(x.status||"").toLowerCase());
        const sum=x=>x.reduce((a,r)=>a+Number(r.amount||0),0);

        const memberCardToken=await cardToken(code,env);
        return json(request,{
          success:true,
          data:{
            member:{
              member_code:m.member_code,prefix:m.prefix,first_name:m.first_name,last_name:m.last_name,
              full_name:m.full_name,arabic_name:m.arabic_name,status:"active",email:m.email,phone:m.phone,
              photo_data:m.photo_data,member_start:m.member_start,member_expire:m.member_expire,registered_at:m.registered_at,
              address:{address_line:m.address_line,subdistrict:m.subdistrict,district:m.district,province:m.province,postal_code:m.postal_code}
            },
            summary:{
              payments_total:sum(payments.filter(paymentApproved)),
              donations_total:sum(donations.filter(donationApproved)),
              benefits_used:usages.length
            },
            payments,donations,benefit_usage:usages,benefits,edit_history:editHistory,
            card_token:memberCardToken,
            module_warnings:moduleWarnings
          }
        });
      }



      if(/^\/api\/member\/card\/[^/]+$/.test(path)&&request.method==="GET"){
        const code=decodeURIComponent(path.split('/').pop()).toUpperCase();
        const token=clean(url.searchParams.get('token'));
        const expected=await cardToken(code,env);
        if(!expected||!safeEqual(token,expected))return json(request,{success:false,message:"QR สำหรับบัตรสมาชิกไม่ถูกต้อง"},403);
        const rows=await sql`SELECT m.member_code,m.prefix,m.first_name,m.last_name,m.full_name,m.arabic_name,m.status,m.email,m.phone,m.photo_data,m.member_start,m.member_expire,a.address_line,a.subdistrict,a.district,a.province,a.postal_code FROM members m LEFT JOIN addresses a ON a.member_code=m.member_code WHERE m.member_code=${code} LIMIT 1`;
        if(!rows.length)return json(request,{success:false,message:"ไม่พบข้อมูลสมาชิก"},404);
        const m=rows[0],eff=effectiveMemberStatus(m);
        return json(request,{success:true,data:{member_code:m.member_code,prefix:m.prefix,first_name:m.first_name,last_name:m.last_name,full_name:m.full_name,arabic_name:m.arabic_name,status:eff,phone:m.phone,email:m.email,photo_data:m.photo_data,member_start:m.member_start,member_expire:m.member_expire,address:{address_line:m.address_line,subdistrict:m.subdistrict,district:m.district,province:m.province,postal_code:m.postal_code}}});
      }

      if(path==="/api/member/edit-history"&&request.method==="POST"){
        const b=await body(request);
        const code=clean(b.member_code).toUpperCase(),identity=clean(b.identity).toLowerCase();
        if(!code||!identity)return json(request,{success:false,message:"ข้อมูลยืนยันสมาชิกไม่ครบ"},400);
        const rows=await sql`SELECT member_code,status,email,phone FROM members WHERE member_code=${code} LIMIT 1`;
        if(!rows.length)return json(request,{success:false,message:"ไม่พบข้อมูลสมาชิก"},404);
        const m=rows[0],normPhone=v=>String(v||"").replace(/\D/g,"");
        { const eff=effectiveMemberStatus(m); if(eff!=="active")return json(request,{success:false,message:eff==="renewal"?"สมาชิกอยู่ในสถานะรอต่ออายุสมาชิก กรุณาชำระค่าบำรุงสมาชิกรายปี":"สมาชิกยังไม่อยู่ในสถานะใช้งาน",status:eff},403); }
        const ok=(m.email&&String(m.email).toLowerCase()===identity)||(m.phone&&normPhone(m.phone)===normPhone(identity));
        if(!ok)return json(request,{success:false,message:"ข้อมูลยืนยันสมาชิกไม่ถูกต้อง กรุณาเข้าสู่ระบบใหม่"},401);
        await sql`CREATE TABLE IF NOT EXISTS member_edit_history(
          edit_id TEXT PRIMARY KEY,member_code TEXT NOT NULL REFERENCES members(member_code) ON UPDATE CASCADE ON DELETE CASCADE,
          changed_fields TEXT[] NOT NULL DEFAULT '{}',change_summary TEXT,source TEXT NOT NULL DEFAULT 'member_portal',
          old_data JSONB,new_data JSONB,changed_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )`;
        const history=await sql`SELECT edit_id,changed_fields,change_summary,source,old_data,new_data,changed_at FROM member_edit_history WHERE member_code=${code} ORDER BY changed_at DESC LIMIT 500`;
        return json(request,{success:true,data:history});
      }

      if(path==="/api/member/update"&&request.method==="POST"){
        const b=await body(request);
        const code=clean(b.member_code).toUpperCase(),identity=clean(b.identity).toLowerCase();
        if(!code||!identity)return json(request,{success:false,message:"ข้อมูลยืนยันสมาชิกไม่ครบ"},400);

        const currentRows=await sql`
          SELECT m.member_code,m.status,m.prefix,m.first_name,m.last_name,m.full_name,m.arabic_name,m.phone,m.email,m.photo_data,
                 a.address_line,a.subdistrict,a.district,a.province,a.postal_code
          FROM members m LEFT JOIN addresses a ON a.member_code=m.member_code
          WHERE m.member_code=${code} LIMIT 1
        `;
        if(!currentRows.length)return json(request,{success:false,message:"ไม่พบข้อมูลสมาชิก"},404);
        const m=currentRows[0];
        { const eff=effectiveMemberStatus(m); if(eff!=="active")return json(request,{success:false,message:eff==="renewal"?"สมาชิกอยู่ในสถานะรอต่ออายุสมาชิก กรุณาชำระค่าบำรุงสมาชิกรายปี":"สมาชิกยังไม่อยู่ในสถานะใช้งาน",status:eff},403); }
        const normPhone=v=>String(v||"").replace(/\D/g,"");
        const ok=(m.email&&String(m.email).toLowerCase()===identity)||(m.phone&&normPhone(m.phone)===normPhone(identity));
        if(!ok)return json(request,{success:false,message:"ข้อมูลยืนยันสมาชิกไม่ถูกต้อง กรุณาเข้าสู่ระบบใหม่"},401);

        const has=k=>Object.prototype.hasOwnProperty.call(b,k);
        const val=(k,old)=>has(k)?clean(b[k]):clean(old);
        const next={
          prefix:val('prefix',m.prefix),first_name:val('first_name',m.first_name),last_name:val('last_name',m.last_name),
          arabic_name:val('arabic_name',m.arabic_name),phone:val('phone',m.phone),email:val('email',m.email).toLowerCase(),
          photo_data:has('photo_data')?clean(b.photo_data):clean(m.photo_data),
          address_line:val('address_line',m.address_line),subdistrict:val('subdistrict',m.subdistrict),district:val('district',m.district),
          province:val('province',m.province),postal_code:val('postal_code',m.postal_code)
        };
        if(!next.first_name||!next.last_name||!next.email)return json(request,{success:false,message:"ชื่อ นามสกุล และอีเมลต้องมีข้อมูลครบ"},400);
        if(next.phone&&!/^\d{9,10}$/.test(normPhone(next.phone)))return json(request,{success:false,message:"เบอร์โทรศัพท์ไม่ถูกต้อง"},400);
        next.phone=normPhone(next.phone);
        if(next.email&&!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(next.email))return json(request,{success:false,message:"รูปแบบอีเมลไม่ถูกต้อง"},400);
        if(next.postal_code&&!/^\d{5}$/.test(next.postal_code))return json(request,{success:false,message:"รหัสไปรษณีย์ต้องเป็นตัวเลข 5 หลัก"},400);
        if(has('photo_data')&&next.photo_data&&!photoOK(next.photo_data))return json(request,{success:false,message:"รูปสมาชิกไม่ถูกต้องหรือมีขนาดใหญ่เกินกำหนด"},400);

        const dup=await sql`
          SELECT member_code FROM members
          WHERE member_code<>${code}
            AND LOWER(TRIM(COALESCE(first_name,'')))=LOWER(TRIM(${next.first_name}))
            AND LOWER(TRIM(COALESCE(last_name,'')))=LOWER(TRIM(${next.last_name}))
            AND LOWER(TRIM(COALESCE(email,'')))=LOWER(TRIM(${next.email}))
          LIMIT 1
        `;
        if(dup.length)return json(request,{success:false,message:`มีสมาชิกชื่อ ${next.first_name} ${next.last_name} และอีเมลนี้อยู่ในระบบแล้ว (${dup[0].member_code})`},409);

        const fields=['prefix','first_name','last_name','arabic_name','phone','email','address_line','subdistrict','district','province','postal_code','photo_data'];
        const changedFields=fields.filter(k=>String(next[k]||'')!==String(m[k]||''));
        const full=[next.first_name,next.last_name].filter(Boolean).join(' ');
        const oldSnap={prefix:m.prefix,first_name:m.first_name,last_name:m.last_name,arabic_name:m.arabic_name,phone:m.phone,email:m.email,address_line:m.address_line,subdistrict:m.subdistrict,district:m.district,province:m.province,postal_code:m.postal_code};
        const newSnap={prefix:next.prefix,first_name:next.first_name,last_name:next.last_name,arabic_name:next.arabic_name,phone:next.phone,email:next.email,address_line:next.address_line,subdistrict:next.subdistrict,district:next.district,province:next.province,postal_code:next.postal_code};
        const changeSummary=changedFields.includes('photo_data')&&changedFields.length===1?'เปลี่ยนรูปสมาชิก':`แก้ไข ${changedFields.filter(x=>x!=='photo_data').length} รายการ${changedFields.includes('photo_data')?' และรูปสมาชิก':''}`;

        await sql.begin(async tx=>{
          await tx`
            CREATE TABLE IF NOT EXISTS member_edit_history(
              edit_id TEXT PRIMARY KEY,member_code TEXT NOT NULL REFERENCES members(member_code) ON UPDATE CASCADE ON DELETE CASCADE,
              changed_fields TEXT[] NOT NULL DEFAULT '{}',change_summary TEXT,source TEXT NOT NULL DEFAULT 'member_portal',
              old_data JSONB,new_data JSONB,changed_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
            )
          `;
          await tx`
            UPDATE members SET prefix=${next.prefix||null},first_name=${next.first_name},last_name=${next.last_name},full_name=${full},
              arabic_name=${next.arabic_name||null},phone=${next.phone||null},email=${next.email},
              photo_data=${next.photo_data||null},updated_at=NOW() WHERE member_code=${code}
          `;
          await tx`
            INSERT INTO addresses(member_code,address_line,subdistrict,district,province,postal_code,updated_at)
            VALUES(${code},${next.address_line||null},${next.subdistrict||null},${next.district||null},${next.province||null},${next.postal_code||null},NOW())
            ON CONFLICT(member_code) DO UPDATE SET address_line=EXCLUDED.address_line,subdistrict=EXCLUDED.subdistrict,district=EXCLUDED.district,
              province=EXCLUDED.province,postal_code=EXCLUDED.postal_code,updated_at=NOW()
          `;
          if(changedFields.length){
            await tx`
              INSERT INTO member_edit_history(edit_id,member_code,changed_fields,change_summary,source,old_data,new_data,changed_at)
              VALUES(${id('EDIT')},${code},${changedFields},${changeSummary},'member_portal',CAST(${JSON.stringify(oldSnap)} AS JSONB),CAST(${JSON.stringify(newSnap)} AS JSONB),NOW())
            `;
          }
        });
        const updated=await sql`
          SELECT m.prefix,m.first_name,m.last_name,m.full_name,m.arabic_name,m.phone,m.email,m.photo_data,
                 a.address_line,a.subdistrict,a.district,a.province,a.postal_code
          FROM members m LEFT JOIN addresses a ON a.member_code=m.member_code WHERE m.member_code=${code} LIMIT 1
        `;
        return json(request,{success:true,message:changedFields.length?"บันทึกข้อมูลสมาชิกแล้ว":"ข้อมูลไม่มีการเปลี่ยนแปลง",data:updated[0],changed_fields:changedFields});
      }

      if(/^\/api\/members\//.test(path)&&request.method==="GET"){
        const code=decodeURIComponent(path.split('/').pop()).toUpperCase();
        const rows=await sql`SELECT m.member_code,m.prefix,m.first_name,m.last_name,m.full_name,m.arabic_name,m.status,m.email,m.phone,m.line_id,m.line_user_id,m.registered_at,m.member_start,m.member_expire,a.address_line,a.subdistrict,a.district,a.province,a.postal_code FROM members m LEFT JOIN addresses a ON a.member_code=m.member_code WHERE m.member_code=${code} LIMIT 1`;
        if(!rows.length)return json(request,{success:true,found:false,message:"ไม่พบข้อมูลสมาชิก"},404);const m=rows[0];
        return json(request,{success:true,found:true,data:{...m,status:effectiveMemberStatus(m),address:{address_line:m.address_line,subdistrict:m.subdistrict,district:m.district,province:m.province,postal_code:m.postal_code}}});
      }

      if(path==="/api/payments"&&request.method==="POST"){
        const b=await body(request),code=clean(b.member_code).toUpperCase(),amount=Number(b.amount||0),slip=clean(b.slip_data);
        if(!code||amount<=0)return json(request,{success:false,message:"ข้อมูลการชำระไม่ครบ"},400);
        if(!b.confirmed)return json(request,{success:false,message:"กรุณายืนยันว่าข้อมูลการชำระถูกต้อง"},400);
        if(!slipOK(slip))return json(request,{success:false,message:"กรุณาแนบสลิป JPG/PNG/WEBP ที่มีขนาดเหมาะสม"},400);
        const m=await sql`SELECT member_code FROM members WHERE member_code=${code} LIMIT 1`;if(!m.length)return json(request,{success:false,message:"ไม่พบรหัสสมาชิก"},404);
        const topicId=clean(b.topic_id)||null;
        let paymentType=clean(b.payment_type)||'ค่าบำรุงสมาคมศิษย์เก่าฯ รายปี';
        if(topicId){const tr=await sql`SELECT title,amount FROM payment_topics WHERE topic_id=${topicId} AND active=TRUE LIMIT 1`;if(!tr.length)return json(request,{success:false,message:"ไม่พบหัวข้อการชำระที่เปิดใช้งาน"},400);paymentType=tr[0].title;if(tr[0].amount!=null&&Math.abs(Number(tr[0].amount)-amount)>0.009)return json(request,{success:false,message:"ยอดชำระไม่ตรงกับยอดที่ Admin กำหนด"},400);}
        await sql`ALTER TABLE payments ADD COLUMN IF NOT EXISTS slip_data TEXT`;
        const paymentId=id('PAY');
        await sql.begin(async tx=>{await tx`INSERT INTO payments(payment_id,member_code,topic_id,payment_type,amount,paid_at,status,note,created_at,updated_at,slip_data) VALUES(${paymentId},${code},${topicId},${paymentType},${amount},${b.paid_at||new Date().toISOString()},'รอตรวจสอบการชำระ',${clean(b.note)||null},NOW(),NOW(),${slip})`;await tx`UPDATE members SET status='review',updated_at=NOW() WHERE member_code=${code} AND status<>'active'`});
        return json(request,{success:true,payment_id:paymentId,status:'รอตรวจสอบการชำระ',member_status:'review'},201);
      }

      if(path==="/api/donations"&&request.method==="POST"){
        const b=await body(request),amount=Number(b.amount||0);let name=clean(b.donor_name);const phone=clean(b.phone).replace(/\D/g,''),email=clean(b.email).toLowerCase(),memberCode=clean(b.member_code).toUpperCase(),topicId=clean(b.topic_id),slip=clean(b.slip_data);
        if(!b.confirmed)return json(request,{success:false,message:"กรุณายืนยันว่าข้อมูลและหลักฐานการโอนเงินถูกต้อง"},400);
        if(amount<=0||!name||!/^\d{9,10}$/.test(phone)||!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)||!topicId)return json(request,{success:false,message:"กรุณากรอกข้อมูลผู้บริจาค หัวข้อ และจำนวนเงินให้ครบ"},400);
        if(!slipOK(slip))return json(request,{success:false,message:"กรุณาแนบสลิป JPG/PNG/WEBP ที่มีขนาดเหมาะสม"},400);
        const topicRows=await sql`SELECT topic_id,title FROM donation_topics WHERE topic_id=${topicId} AND active=TRUE LIMIT 1`;if(!topicRows.length)return json(request,{success:false,message:"ไม่พบหัวข้อบริจาคที่เปิดใช้งาน"},400);
        if(memberCode){const mr=await sql`SELECT member_code,prefix,first_name,last_name,full_name,phone,email FROM members WHERE member_code=${memberCode} LIMIT 1`;if(!mr.length)return json(request,{success:false,message:"ไม่พบรหัสสมาชิก"},404);const m=mr[0],mn=[m.prefix,m.first_name,m.last_name].filter(Boolean).join(' ')||m.full_name||'';if(mn)name=mn;}
        const donationId=id('DON');await ensureV2616Schema(sql);await sql`ALTER TABLE donations ADD COLUMN IF NOT EXISTS slip_data TEXT`;
        await sql`INSERT INTO donations(donation_id,member_code,topic_id,amount,donated_at,slip_url,status,donor_name,phone,email,created_at,updated_at,slip_data,note,address_line,subdistrict,district,province,postal_code) VALUES(${donationId},${memberCode||null},${topicId},${amount},${b.donated_at||new Date().toISOString()},NULL,'รอตรวจสอบ',${name},${phone},${email},NOW(),NOW(),${slip},${clean(b.note)||null},${clean(b.address_line)||null},${clean(b.subdistrict)||null},${clean(b.district)||null},${clean(b.province)||null},${clean(b.postal_code)||null})`;
        return json(request,{success:true,donation_id:donationId,status:'รอตรวจสอบ'},201);
      }

      if(path==="/api/home/summary"&&request.method==="GET"){
        await ensureNewsSchema(sql);
        const counts=await sql`SELECT
          COUNT(*)::int AS total,
          COUNT(*) FILTER (WHERE registered_at >= date_trunc('year',NOW()))::int AS this_year,
          COUNT(*) FILTER (WHERE registered_at >= date_trunc('month',NOW()))::int AS this_month
          FROM members`;
        const acts=await sql`SELECT COUNT(*)::int AS activities_this_year FROM news WHERE active=TRUE AND category='กิจกรรม' AND publish_date >= date_trunc('year',NOW())`;
        return json(request,{success:true,data:{total:counts[0]?.total||0,this_year:counts[0]?.this_year||0,this_month:counts[0]?.this_month||0,activities_this_year:acts[0]?.activities_this_year||0}});
      }

      if(path==="/api/news"&&request.method==="GET"){
        await ensureNewsSchema(sql);
        const rows=await sql`SELECT news_id,category,title,content,publish_date,image_data,image_name,featured FROM news WHERE active=TRUE ORDER BY featured DESC,publish_date DESC LIMIT 100`;
        return json(request,{success:true,data:rows});
      }
      if(path==="/api/admin/benefit-usage"&&request.method==="POST"){
        const denied=requireAdmin(request,env);if(denied)return denied;
        const b=await body(request),code=clean(b.member_code).toUpperCase(),benefitId=clean(b.benefit_id),amount=Math.max(0,Number(b.amount||0));
        if(!code||!benefitId)return json(request,{success:false,message:"กรุณาระบุสมาชิกและสิทธิประโยชน์"},400);
        const member=await sql`SELECT member_code FROM members WHERE member_code=${code} LIMIT 1`;
        if(!member.length)return json(request,{success:false,message:"ไม่พบรหัสสมาชิก"},404);
        const benefit=await sql`SELECT benefit_id FROM benefits WHERE benefit_id=${benefitId} LIMIT 1`;
        if(!benefit.length)return json(request,{success:false,message:"ไม่พบสิทธิประโยชน์"},404);
        await sql`
          CREATE TABLE IF NOT EXISTS benefit_usage(
            usage_id VARCHAR(80) PRIMARY KEY,
            member_code VARCHAR(20) NOT NULL REFERENCES members(member_code) ON DELETE RESTRICT,
            benefit_id VARCHAR(80) NOT NULL REFERENCES benefits(benefit_id) ON DELETE RESTRICT,
            used_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
            recorded_by VARCHAR(100) NOT NULL,
            note TEXT,amount NUMERIC(12,2) NOT NULL DEFAULT 0 CHECK(amount>=0),
            created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
          )
        `;
        const usageId=id('USE');
        await sql`INSERT INTO benefit_usage(usage_id,member_code,benefit_id,used_at,recorded_by,note,amount,created_at) VALUES(${usageId},${code},${benefitId},${b.used_at||new Date().toISOString()},${clean(b.recorded_by)||'admin'},${clean(b.note)||null},${amount},NOW())`;
        return json(request,{success:true,usage_id:usageId,message:"บันทึกการใช้สิทธิประโยชน์แล้ว"},201);
      }

      if(path==="/api/member/benefits-info"&&request.method==="POST"){
        const b=await body(request),code=clean(b.member_code).toUpperCase(),identity=clean(b.identity).toLowerCase();
        if(!code||!identity)return json(request,{success:false,message:"กรุณากรอกรหัสสมาชิกและอีเมลหรือเบอร์โทรศัพท์"},400);
        const rows=await sql`SELECT member_code,prefix,first_name,last_name,full_name,arabic_name,status,email,phone,member_expire FROM members WHERE member_code=${code} LIMIT 1`;
        if(!rows.length)return json(request,{success:false,message:"ไม่พบข้อมูลสมาชิก"},404);
        const m=rows[0],norm=v=>String(v||"").replace(/\D/g,"");
        const ok=(m.email&&String(m.email).toLowerCase()===identity)||(m.phone&&norm(m.phone)===norm(identity));
        if(!ok)return json(request,{success:false,message:"อีเมลหรือเบอร์โทรไม่ตรงกับข้อมูลสมาชิก"},401);
        const st=effectiveMemberStatus(m);
        return json(request,{success:true,data:{member_code:m.member_code,arabic_name:m.arabic_name,full_name:m.full_name,prefix:m.prefix,first_name:m.first_name,last_name:m.last_name,status:st,member_expire:m.member_expire}});
      }

      if(path==="/api/benefits"&&request.method==="GET"){
        const rows=await sql`SELECT benefit_id,title,description,start_date,end_date FROM benefits WHERE active=TRUE AND (start_date IS NULL OR start_date<=CURRENT_DATE) AND (end_date IS NULL OR end_date>=CURRENT_DATE) ORDER BY created_at DESC`;
        return json(request,{success:true,data:rows});
      }

      if(path==="/api/admin/members"&&request.method==="GET"){
        const denied=requireAdmin(request,env);if(denied)return denied;
        const rows=await sql`SELECT m.member_code,m.prefix,m.first_name,m.last_name,m.full_name,m.arabic_name,m.email,m.phone,m.line_id,m.line_user_id,m.status,m.registered_at,m.member_start,m.member_expire,a.address_line,a.subdistrict,a.district,a.province,a.postal_code FROM members m LEFT JOIN addresses a ON a.member_code=m.member_code ORDER BY m.registered_at DESC`;
        return json(request,{success:true,data:rows.map(x=>({...x,status:memberStatusText(x.status)}))});
      }
      if(/^\/api\/admin\/members\/[^/]+\/overview$/.test(path)&&request.method==="GET"){
        const denied=requireAdmin(request,env);if(denied)return denied;await ensureMemberAdminSchema(sql);
        const code=decodeURIComponent(path.split('/')[4]).toUpperCase();
        const mr=await sql`SELECT m.*,a.address_line,a.subdistrict,a.district,a.province,a.postal_code FROM members m LEFT JOIN addresses a ON a.member_code=m.member_code WHERE m.member_code=${code} LIMIT 1`;
        if(!mr.length)return json(request,{success:false,message:"ไม่พบสมาชิก"},404);
        const payments=await sql`SELECT payment_id,payment_type,amount,status,paid_at,verified_at,receipt_no FROM payments WHERE member_code=${code} ORDER BY paid_at DESC,created_at DESC LIMIT 500`;
        const donations=await sql`SELECT d.donation_id,d.topic_id,COALESCE(dt.title,d.topic_id) AS topic_title,d.amount,d.status,d.donated_at FROM donations d LEFT JOIN donation_topics dt ON dt.topic_id=d.topic_id WHERE d.member_code=${code} ORDER BY d.donated_at DESC,d.created_at DESC LIMIT 500`;
        let usages=[];try{const ex=await sql`SELECT to_regclass('public.benefit_usage') AS t`;if(ex[0]?.t)usages=await sql`SELECT u.usage_id,u.used_at,u.amount,u.note,u.benefit_id,COALESCE(b.title,u.benefit_id) AS title FROM benefit_usage u LEFT JOIN benefits b ON b.benefit_id=u.benefit_id WHERE u.member_code=${code} ORDER BY u.used_at DESC,u.created_at DESC LIMIT 500`}catch(e){}
        const logs=await sql`SELECT log_id,action,detail,admin_by,created_at FROM member_admin_logs WHERE member_code=${code} ORDER BY created_at DESC LIMIT 300`;
        const memberCardToken=await cardToken(code,env);return json(request,{success:true,data:{member:{...mr[0],status:memberStatusText(mr[0].status)},payments,donations,benefit_usage:usages,logs,card_token:memberCardToken}});
      }
      if(/^\/api\/admin\/members\/[^/]+\/logs$/.test(path)&&request.method==="GET"){
        const denied=requireAdmin(request,env);if(denied)return denied;await ensureMemberAdminSchema(sql);const code=decodeURIComponent(path.split('/')[4]).toUpperCase();
        const rows=await sql`SELECT log_id,member_code,action,detail,admin_by,created_at FROM member_admin_logs WHERE member_code=${code} ORDER BY created_at DESC LIMIT 500`;return json(request,{success:true,data:rows});
      }
      if(/^\/api\/admin\/members\/[^/]+$/.test(path)){
        const denied=requireAdmin(request,env);if(denied)return denied;const code=decodeURIComponent(path.split('/').pop()).toUpperCase();
        if(request.method==="GET"){
          const rows=await sql`SELECT m.*,a.address_line,a.subdistrict,a.district,a.province,a.postal_code FROM members m LEFT JOIN addresses a ON a.member_code=m.member_code WHERE m.member_code=${code} LIMIT 1`;if(!rows.length)return json(request,{success:false,message:"ไม่พบสมาชิก"},404);return json(request,{success:true,data:{...rows[0],status:memberStatusText(rows[0].status)}});
        }
        if(request.method==="DELETE"){
          await ensureMemberAdminSchema(sql);const before=await sql`SELECT member_code,full_name,email,phone,status FROM members WHERE member_code=${code} LIMIT 1`;if(!before.length)return json(request,{success:false,message:"ไม่พบสมาชิก"},404);
          const pc=await sql`SELECT COUNT(*)::int n FROM payments WHERE member_code=${code}`,dc=await sql`SELECT COUNT(*)::int n FROM donations WHERE member_code=${code}`;let bc=[{n:0}];try{const ex=await sql`SELECT to_regclass('public.benefit_usage') AS t`;if(ex[0]?.t)bc=await sql`SELECT COUNT(*)::int n FROM benefit_usage WHERE member_code=${code}`}catch(e){}
          const history={payments:Number(pc[0]?.n||0),donations:Number(dc[0]?.n||0),benefits:Number(bc[0]?.n||0)};if(history.payments||history.donations||history.benefits)return json(request,{success:false,code:'MEMBER_HAS_HISTORY',message:'สมาชิกมีประวัติชำระ บริจาค หรือการใช้สิทธิ์ จึงลบไม่ได้ ให้เปลี่ยนสถานะเป็นยกเลิก/ไม่อนุมัติแทน',history},409);
          try{await sql.begin(async tx=>{try{await tx`DELETE FROM member_edit_history WHERE member_code=${code}`}catch(e){}await tx`DELETE FROM addresses WHERE member_code=${code}`;await tx`DELETE FROM members WHERE member_code=${code}`;await tx`INSERT INTO member_admin_logs(log_id,member_code,action,detail,old_data,new_data,admin_by,created_at) VALUES(${id('MLOG')},${code},'delete','ลบสมาชิกที่ไม่มีประวัติทางบัญชีหรือการใช้สิทธิ์',CAST(${JSON.stringify(before[0])} AS JSONB),NULL,'admin',NOW())`;})}catch(e){return json(request,{success:false,message:"ลบข้อมูลไม่สำเร็จ: "+String(e?.message||e)},500)}
          return json(request,{success:true,message:"ลบสมาชิกแล้ว"});
        }
        if(request.method==="PUT"||request.method==="PATCH"){
          await ensureMemberAdminSchema(sql);const b=await body(request),beforeRows=await sql`SELECT m.*,a.address_line,a.subdistrict,a.district,a.province,a.postal_code FROM members m LEFT JOIN addresses a ON a.member_code=m.member_code WHERE m.member_code=${code} LIMIT 1`;if(!beforeRows.length)return json(request,{success:false,message:"ไม่พบสมาชิก"},404);
          if(Object.prototype.hasOwnProperty.call(b,'photo_data')&&b.photo_data&&!photoOK(b.photo_data))return json(request,{success:false,message:"รูปสมาชิกต้องเป็น JPG/WEBP และขนาดไม่เกินที่ระบบกำหนด"},400);
          const full=[clean(b.first_name),clean(b.last_name)].filter(Boolean).join(' ')||clean(b.full_name),hasPhoto=Object.prototype.hasOwnProperty.call(b,'photo_data');
          await sql.begin(async tx=>{
            await tx`UPDATE members SET prefix=COALESCE(NULLIF(${clean(b.prefix)},''),prefix),first_name=COALESCE(NULLIF(${clean(b.first_name)},''),first_name),last_name=COALESCE(NULLIF(${clean(b.last_name)},''),last_name),full_name=COALESCE(NULLIF(${full},''),full_name),arabic_name=${clean(b.arabic_name)||null},phone=COALESCE(NULLIF(${clean(b.phone)},''),phone),email=${clean(b.email)||null},line_id=${clean(b.line_id)||null},line_user_id=${clean(b.line_id)||null},photo_data=CASE WHEN ${hasPhoto} THEN ${clean(b.photo_data)||null} ELSE photo_data END,status=COALESCE(NULLIF(${clean(b.status)},''),status),updated_at=NOW() WHERE member_code=${code}`;
            await tx`INSERT INTO addresses(member_code,address_line,subdistrict,district,province,postal_code,updated_at) VALUES(${code},${clean(b.address_line)||null},${clean(b.subdistrict)||null},${clean(b.district)||null},${clean(b.province)||null},${clean(b.postal_code)||null},NOW()) ON CONFLICT(member_code) DO UPDATE SET address_line=EXCLUDED.address_line,subdistrict=EXCLUDED.subdistrict,district=EXCLUDED.district,province=EXCLUDED.province,postal_code=EXCLUDED.postal_code,updated_at=NOW()`;
            const after={...b,full_name:full};await tx`INSERT INTO member_admin_logs(log_id,member_code,action,detail,old_data,new_data,admin_by,created_at) VALUES(${id('MLOG')},${code},'edit','แก้ไขข้อมูลสมาชิก',CAST(${JSON.stringify(beforeRows[0])} AS JSONB),CAST(${JSON.stringify(after)} AS JSONB),'admin',NOW())`;
          });
          return json(request,{success:true,message:"บันทึกแล้ว"});
        }
      }
      if(/^\/api\/admin\/members\/[^/]+\/status$/.test(path)&&request.method==="PATCH"){
        const denied=requireAdmin(request,env);if(denied)return denied;await ensureMemberAdminSchema(sql);const code=decodeURIComponent(path.split('/')[4]).toUpperCase(),b=await body(request),st=memberStatusText(b.status),reason=clean(b.reason);const old=await sql`SELECT status FROM members WHERE member_code=${code} LIMIT 1`;if(!old.length)return json(request,{success:false,message:"ไม่พบสมาชิก"},404);
        const stored=st==='cancelled'&&reason?`ไม่อนุมัติ (${reason})`:st;
        await sql.begin(async tx=>{await tx`UPDATE members SET status=${stored},member_start=CASE WHEN ${st}='active' AND member_start IS NULL THEN NOW() ELSE member_start END,member_expire=CASE WHEN ${st}='active' AND member_expire IS NULL THEN NOW()+INTERVAL '1 year' ELSE member_expire END,updated_at=NOW() WHERE member_code=${code}`;await tx`INSERT INTO member_admin_logs(log_id,member_code,action,detail,old_data,new_data,admin_by,created_at) VALUES(${id('MLOG')},${code},'status',${st==='cancelled'&&reason?'ไม่อนุมัติ: '+reason:'เปลี่ยนสถานะเป็น '+st},CAST(${JSON.stringify(old[0])} AS JSONB),CAST(${JSON.stringify({status:stored,reason})} AS JSONB),'admin',NOW())`});return json(request,{success:true,status:stored});
      }

      if(path==="/api/admin/payment-topics"){
        const denied=requireAdmin(request,env);if(denied)return denied;await ensureV2616Schema(sql);
        if(request.method==="GET"){const rows=await sql`SELECT topic_id,title,description,amount,active,created_at,updated_at FROM payment_topics ORDER BY created_at,title`;return json(request,{success:true,data:rows})}
        if(request.method==="POST"){
          const b=await body(request),title=clean(b.title),amount=b.amount===''||b.amount==null?null:Number(b.amount);if(!title)return json(request,{success:false,message:"กรุณากรอกหัวข้อรายการ"},400);if(amount!=null&&(!Number.isFinite(amount)||amount<0))return json(request,{success:false,message:"ยอดเงินไม่ถูกต้อง"},400);
          const tid=clean(b.topic_id)||id('TOPIC');await sql`INSERT INTO payment_topics(topic_id,title,description,amount,active,created_at,updated_at) VALUES(${tid},${title},${clean(b.description)||null},${amount},${b.active!==false},NOW(),NOW()) ON CONFLICT(topic_id) DO UPDATE SET title=EXCLUDED.title,description=EXCLUDED.description,amount=EXCLUDED.amount,active=EXCLUDED.active,updated_at=NOW()`;return json(request,{success:true,topic_id:tid,message:"บันทึกหัวข้อการชำระแล้ว"},201)
        }
      }
      if(/^\/api\/admin\/payment-topics\/[^/]+$/.test(path)&&request.method==="DELETE"){
        const denied=requireAdmin(request,env);if(denied)return denied;const tid=decodeURIComponent(path.split('/').pop());if(url.searchParams.get('hard')==='1'){if(tid==='membership')return json(request,{success:false,message:'หัวข้อค่าบำรุงหลักไม่สามารถลบได้ ให้แก้ไขหรือปิดใช้งานแทน'},409);const c=await sql`SELECT COUNT(*)::int n FROM payments WHERE topic_id=${tid}`;if(Number(c[0]?.n||0)>0)return json(request,{success:false,message:'หัวข้อนี้มีประวัติการชำระอ้างอิงอยู่ จึงลบไม่ได้ ให้ปิดใช้งานแทน'},409);await sql`DELETE FROM payment_topics WHERE topic_id=${tid}`;return json(request,{success:true,message:'ลบหัวข้อแล้ว'})}await sql`UPDATE payment_topics SET active=FALSE,updated_at=NOW() WHERE topic_id=${tid}`;return json(request,{success:true,message:"ปิดใช้งานหัวข้อแล้ว"});
      }

      if(path==="/api/admin/donation-topics"){
        const denied=requireAdmin(request,env);if(denied)return denied;
        if(request.method==="GET"){const rows=await sql`SELECT topic_id,title,description,active,created_at,updated_at FROM donation_topics ORDER BY created_at,title`;return json(request,{success:true,data:rows})}
        if(request.method==="POST"){
          const b=await body(request),title=clean(b.title);if(!title)return json(request,{success:false,message:"กรุณากรอกหัวข้อการบริจาค"},400);
          const tid=clean(b.topic_id)||id('DTOPIC');
          await sql`INSERT INTO donation_topics(topic_id,title,description,active,created_at,updated_at) VALUES(${tid},${title},${clean(b.description)||null},${b.active!==false},NOW(),NOW()) ON CONFLICT(topic_id) DO UPDATE SET title=EXCLUDED.title,description=EXCLUDED.description,active=EXCLUDED.active,updated_at=NOW()`;
          return json(request,{success:true,topic_id:tid,message:"บันทึกหัวข้อบริจาคแล้ว"},201)
        }
      }
      if(/^\/api\/admin\/donation-topics\/[^/]+$/.test(path)&&request.method==="DELETE"){
        const denied=requireAdmin(request,env);if(denied)return denied;const tid=decodeURIComponent(path.split('/').pop());if(url.searchParams.get('hard')==='1'){const c=await sql`SELECT COUNT(*)::int n FROM donations WHERE topic_id=${tid}`;if(Number(c[0]?.n||0)>0)return json(request,{success:false,message:'หัวข้อนี้มีประวัติการสนับสนุนอ้างอิงอยู่ จึงลบไม่ได้ ให้ปิดใช้งานแทน'},409);await sql`DELETE FROM donation_topics WHERE topic_id=${tid}`;return json(request,{success:true,message:'ลบหัวข้อแล้ว'})}await sql`UPDATE donation_topics SET active=FALSE,updated_at=NOW() WHERE topic_id=${tid}`;return json(request,{success:true,message:"ปิดใช้งานหัวข้อบริจาคแล้ว"});
      }
      if(/^\/api\/admin\/payments\/[^/]+\/verify$/.test(path)&&request.method==="PATCH"){
        const denied=requireAdmin(request,env);if(denied)return denied;const paymentId=decodeURIComponent(path.split('/')[4]),b=await body(request),approve=String(b.action||'approve').toLowerCase()==='approve',admin=clean(b.verified_by)||'admin';
        await sql`ALTER TABLE payments ADD COLUMN IF NOT EXISTS receipt_no TEXT`;
        await sql`ALTER TABLE payments ADD COLUMN IF NOT EXISTS receipt_issued_at TIMESTAMPTZ`;
        const rows=await sql`SELECT payment_id,member_code,payment_type,amount,status,paid_at,slip_data FROM payments WHERE payment_id=${paymentId} LIMIT 1`;if(!rows.length)return json(request,{success:false,message:"ไม่พบรายการชำระ"},404);const pay=rows[0];
        if(pay.status==='ชำระแล้ว')return json(request,{success:true,message:"รายการนี้ยืนยันแล้ว"});
        if(!approve){await sql`UPDATE payments SET status='ไม่อนุมัติ',verified_by=${admin},verified_at=NOW(),note=COALESCE(NULLIF(${clean(b.note)},''),note),updated_at=NOW() WHERE payment_id=${paymentId}`;return json(request,{success:true,message:"บันทึกไม่อนุมัติแล้ว"})}
        await sql.begin(async tx=>{
          await tx`UPDATE payments SET status='ชำระแล้ว',verified_by=${admin},verified_at=NOW(),receipt_no=COALESCE(receipt_no,'RCP-'||TO_CHAR(NOW(),'YYYYMMDD')||'-'||UPPER(SUBSTR(MD5(payment_id),1,6))),receipt_issued_at=COALESCE(receipt_issued_at,NOW()),note=COALESCE(NULLIF(${clean(b.note)},''),note),updated_at=NOW() WHERE payment_id=${paymentId}`;
          await tx`UPDATE members SET status='active',member_start=COALESCE(member_start,NOW()),member_expire=(CASE WHEN member_expire IS NULL OR member_expire<NOW() THEN NOW() ELSE member_expire END)+INTERVAL '1 year',updated_at=NOW() WHERE member_code=${pay.member_code}`;
          await tx`INSERT INTO ledger_entries(entry_id,entry_date,entry_type,category,source,amount,reference_type,reference_id,member_code,description,note,created_by,status,created_at,updated_at,attachment_data,attachment_name,attachment_type)
            SELECT ${id('LED')},NOW(),'รายรับ','ค่าสมาชิก',${pay.payment_type},${pay.amount},'payment',${pay.payment_id},${pay.member_code},${'รับค่าบำรุงสมาคมศิษย์เก่าฯ รายปี '+pay.member_code},${clean(b.note)||null},${admin},'posted',NOW(),NOW(),${pay.slip_data||null},${pay.slip_data?'หลักฐานการโอน '+pay.payment_id:null},${pay.slip_data?(String(pay.slip_data).startsWith('data:application/pdf')?'application/pdf':'image/*'):null}
            WHERE NOT EXISTS (SELECT 1 FROM ledger_entries WHERE reference_type='payment' AND reference_id=${pay.payment_id} AND entry_type='รายรับ')`;
        });
        return json(request,{success:true,message:"ยืนยันการชำระแล้ว ต่ออายุสมาชิก 1 ปี และลงบัญชีรายรับเรียบร้อย"});
      }

      if(/^\/api\/admin\/payments\/[^/]+\/receipt$/.test(path)&&request.method==="GET"){
        const denied=requireAdmin(request,env);if(denied)return denied;
        const paymentId=decodeURIComponent(path.split('/')[4]);
        await sql`ALTER TABLE payments ADD COLUMN IF NOT EXISTS receipt_no TEXT`;
        await sql`ALTER TABLE payments ADD COLUMN IF NOT EXISTS receipt_issued_at TIMESTAMPTZ`;
        await sql`UPDATE payments SET receipt_no=COALESCE(receipt_no,'RCP-'||TO_CHAR(COALESCE(verified_at,paid_at,created_at),'YYYYMMDD')||'-'||UPPER(SUBSTR(MD5(payment_id),1,6))),receipt_issued_at=COALESCE(receipt_issued_at,verified_at,updated_at,NOW()) WHERE payment_id=${paymentId} AND status='ชำระแล้ว'`;
        const rows=await sql`SELECT p.payment_id,p.member_code,p.payment_type,p.amount,p.paid_at,p.status,p.verified_by,p.verified_at,p.receipt_no,p.receipt_issued_at,m.prefix,m.first_name,m.last_name,m.full_name,m.phone,m.email,a.address_line,a.subdistrict,a.district,a.province,a.postal_code FROM payments p LEFT JOIN members m ON m.member_code=p.member_code LEFT JOIN addresses a ON a.member_code=p.member_code WHERE p.payment_id=${paymentId} LIMIT 1`;
        if(!rows.length)return json(request,{success:false,message:"ไม่พบรายการชำระ"},404);
        if(rows[0].status!=="ชำระแล้ว")return json(request,{success:false,message:"ออกใบเสร็จได้เมื่อรายการได้รับอนุมัติแล้ว"},409);
        const st=await sql`SELECT setting_key,setting_value FROM app_settings WHERE setting_key IN ('APP_NAME','CONTACT_EMAIL','BANK_ACCOUNT_NAME','BANK_NAME','BANK_ACCOUNT_NO','ASSOCIATION_ADDRESS','ASSOCIATION_STAMP','HOME_QUOTE','HOME_QUOTE_BY','HOME_NEWS_TITLE')`;
        const settings={};for(const r of st)settings[r.setting_key]=r.setting_value;
        return json(request,{success:true,data:{...rows[0],settings}})
      }

      if(path==="/api/admin/payments"&&request.method==="GET"){
        const denied=requireAdmin(request,env);if(denied)return denied;
        await sql`ALTER TABLE payments ADD COLUMN IF NOT EXISTS slip_data TEXT`;
        await sql`ALTER TABLE payments ADD COLUMN IF NOT EXISTS receipt_no TEXT`;
        await sql`ALTER TABLE payments ADD COLUMN IF NOT EXISTS receipt_issued_at TIMESTAMPTZ`;
        await sql`UPDATE payments SET receipt_no=COALESCE(receipt_no,'RCP-'||TO_CHAR(COALESCE(verified_at,paid_at,created_at),'YYYYMMDD')||'-'||UPPER(SUBSTR(MD5(payment_id),1,6))), receipt_issued_at=COALESCE(receipt_issued_at,verified_at,updated_at,NOW()) WHERE status='ชำระแล้ว' AND (receipt_no IS NULL OR receipt_issued_at IS NULL)`;
        const rows=await sql`SELECT p.*,m.full_name,m.prefix,m.first_name,m.last_name,m.email AS member_email,m.phone AS member_phone FROM payments p LEFT JOIN members m ON m.member_code=p.member_code ORDER BY p.created_at DESC LIMIT 1000`;
        return json(request,{success:true,data:rows})
      }
      if(path==="/api/admin/donations"&&request.method==="GET"){
        const denied=requireAdmin(request,env);if(denied)return denied;await ensureV2616Schema(sql);
        await sql`ALTER TABLE donations ADD COLUMN IF NOT EXISTS slip_data TEXT`;
        const rows=await sql`SELECT d.*,dt.title AS topic_title,m.full_name AS member_full_name FROM donations d LEFT JOIN donation_topics dt ON dt.topic_id=d.topic_id LEFT JOIN members m ON m.member_code=d.member_code ORDER BY d.created_at DESC LIMIT 1000`;
        return json(request,{success:true,data:rows})
      }
      if(path==="/api/admin/receipts"&&request.method==="GET"){
        const denied=requireAdmin(request,env);if(denied)return denied;await ensureV2616Schema(sql);
        await sql`UPDATE payments SET receipt_no=COALESCE(receipt_no,'RCP-'||TO_CHAR(COALESCE(verified_at,paid_at,created_at),'YYYYMMDD')||'-'||UPPER(SUBSTR(MD5(payment_id),1,6))),receipt_issued_at=COALESCE(receipt_issued_at,verified_at,updated_at,NOW()) WHERE status='ชำระแล้ว' AND (receipt_no IS NULL OR receipt_issued_at IS NULL)`;
        await sql`UPDATE donations SET receipt_no=COALESCE(receipt_no,'RCP-'||TO_CHAR(COALESCE(verified_at,donated_at,created_at),'YYYYMMDD')||'-D'||UPPER(SUBSTR(MD5(donation_id),1,5))),receipt_issued_at=COALESCE(receipt_issued_at,verified_at,updated_at,NOW()) WHERE status IN ('ตรวจสอบแล้ว','อนุมัติ','approved','verified') AND (receipt_no IS NULL OR receipt_issued_at IS NULL)`;
        const rows=await sql`SELECT * FROM (SELECT 'payment'::text AS source_type,p.payment_id AS transaction_id,p.receipt_no,p.receipt_issued_at,p.member_code,p.payment_type AS receipt_type,p.amount,p.paid_at AS transferred_at,p.verified_by,p.verified_at,m.prefix,m.first_name,m.last_name,m.full_name,m.phone,m.email FROM payments p LEFT JOIN members m ON m.member_code=p.member_code WHERE p.status='ชำระแล้ว' UNION ALL SELECT 'donation'::text AS source_type,d.donation_id AS transaction_id,d.receipt_no,d.receipt_issued_at,d.member_code,COALESCE(dt.title,'เงินบริจาค') AS receipt_type,d.amount,d.donated_at AS transferred_at,d.verified_by,d.verified_at,m.prefix,m.first_name,m.last_name,COALESCE(m.full_name,d.donor_name) AS full_name,COALESCE(m.phone,d.phone) AS phone,COALESCE(m.email,d.email) AS email FROM donations d LEFT JOIN donation_topics dt ON dt.topic_id=d.topic_id LEFT JOIN members m ON m.member_code=d.member_code WHERE d.status IN ('ตรวจสอบแล้ว','อนุมัติ','approved','verified')) q ORDER BY receipt_issued_at DESC LIMIT 4000`;
        return json(request,{success:true,data:rows});
      }
      if(path==="/api/admin/receipt-print-logs"&&request.method==="GET"){
        const denied=requireAdmin(request,env);if(denied)return denied;await ensureV2616Schema(sql);
        const rows=await sql`SELECT * FROM receipt_print_logs ORDER BY printed_at DESC LIMIT 5000`;
        return json(request,{success:true,data:rows});
      }
      if(path==="/api/admin/receipt-print-logs"&&request.method==="POST"){
        const denied=requireAdmin(request,env);if(denied)return denied;await ensureV2616Schema(sql);const b=await body(request);let items=Array.isArray(b.items)?b.items.slice(0,500):[];if(!items.length&&Array.isArray(b.payment_ids))items=b.payment_ids.map(x=>({source_type:'payment',transaction_id:x}));if(!items.length)return json(request,{success:false,message:'ไม่พบรายการใบเสร็จที่จะบันทึกประวัติพิมพ์'},400);const batch=clean(b.batch_id)||id('BATCH'),ptype=clean(b.print_type)||'single',who=clean(b.printed_by)||'admin',ua=clean(b.user_agent).slice(0,500);
        for(const it of items){const st=clean(it.source_type)==='donation'?'donation':'payment',tid=clean(it.transaction_id);if(!tid)continue;let rr=[];if(st==='donation')rr=await sql`SELECT receipt_no FROM donations WHERE donation_id=${tid} AND status IN ('ตรวจสอบแล้ว','อนุมัติ','approved','verified') LIMIT 1`;else rr=await sql`SELECT receipt_no FROM payments WHERE payment_id=${tid} AND status='ชำระแล้ว' LIMIT 1`;if(!rr.length)continue;await sql`INSERT INTO receipt_print_logs(log_id,batch_id,payment_id,receipt_no,print_type,printed_by,printed_at,user_agent,source_type,transaction_id) VALUES(${id('PRN')},${batch},${tid},${rr[0].receipt_no||null},${ptype},${who},NOW(),${ua||null},${st},${tid})`}
        return json(request,{success:true,batch_id:batch,message:'บันทึกประวัติการพิมพ์แล้ว'},201)
      }

      if(/^\/api\/admin\/donations\/[^/]+\/verify$/.test(path)&&request.method==="PATCH"){
        const denied=requireAdmin(request,env);if(denied)return denied;
        await ensureV2616Schema(sql);const donationId=decodeURIComponent(path.split('/')[4]),b=await body(request),approve=String(b.action||'approve').toLowerCase()==='approve',admin=clean(b.verified_by)||'admin';
        const rows=await sql`SELECT d.donation_id,d.member_code,d.topic_id,d.amount,d.status,d.donated_at,d.donor_name,d.slip_data,dt.title AS topic_title FROM donations d LEFT JOIN donation_topics dt ON dt.topic_id=d.topic_id WHERE d.donation_id=${donationId} LIMIT 1`;
        if(!rows.length)return json(request,{success:false,message:"ไม่พบรายการบริจาค"},404);
        const don=rows[0],done=["ตรวจสอบแล้ว","อนุมัติ","approved","verified"].includes(String(don.status||"").toLowerCase());
        if(done)return json(request,{success:true,message:"รายการนี้ตรวจสอบแล้ว"});
        if(!approve){
          await sql`UPDATE donations SET status='ไม่อนุมัติ',verified_by=${admin},verified_at=NOW(),note=COALESCE(NULLIF(${clean(b.note)},''),note),updated_at=NOW() WHERE donation_id=${donationId}`;
          return json(request,{success:true,message:"บันทึกไม่อนุมัติแล้ว"})
        }
        await sql.begin(async tx=>{
          await tx`UPDATE donations SET status='ตรวจสอบแล้ว',verified_by=${admin},verified_at=NOW(),receipt_no=COALESCE(receipt_no,'RCP-'||TO_CHAR(NOW(),'YYYYMMDD')||'-D'||UPPER(SUBSTR(MD5(donation_id),1,5))),receipt_issued_at=COALESCE(receipt_issued_at,NOW()),note=COALESCE(NULLIF(${clean(b.note)},''),note),updated_at=NOW() WHERE donation_id=${donationId}`;
          await tx`INSERT INTO ledger_entries(entry_id,entry_date,entry_type,category,source,amount,reference_type,reference_id,member_code,description,note,created_by,status,created_at,updated_at,attachment_data,attachment_name,attachment_type)
            SELECT ${id('LED')},NOW(),'รายรับ','เงินบริจาค',${don.topic_title||'บริจาค'},${don.amount},'donation',${don.donation_id},${don.member_code||null},${'รับเงินบริจาค '+(don.donor_name||'')},${clean(b.note)||null},${admin},'posted',NOW(),NOW(),${don.slip_data||null},${don.slip_data?'หลักฐานการโอน '+don.donation_id:null},${don.slip_data?(String(don.slip_data).startsWith('data:application/pdf')?'application/pdf':'image/*'):null}
            WHERE NOT EXISTS (SELECT 1 FROM ledger_entries WHERE reference_type='donation' AND reference_id=${don.donation_id} AND entry_type='รายรับ')`;
        });
        return json(request,{success:true,message:"ยืนยันการบริจาคและลงบัญชีรายรับเรียบร้อย"})
      }
      if(/^\/api\/admin\/donations\/[^/]+\/receipt$/.test(path)&&request.method==="GET"){
        const denied=requireAdmin(request,env);if(denied)return denied;await ensureV2616Schema(sql);const donationId=decodeURIComponent(path.split('/')[4]);
        await sql`UPDATE donations SET receipt_no=COALESCE(receipt_no,'RCP-'||TO_CHAR(COALESCE(verified_at,donated_at,created_at),'YYYYMMDD')||'-D'||UPPER(SUBSTR(MD5(donation_id),1,5))),receipt_issued_at=COALESCE(receipt_issued_at,verified_at,updated_at,NOW()) WHERE donation_id=${donationId} AND status IN ('ตรวจสอบแล้ว','อนุมัติ','approved','verified')`;
        const rows=await sql`SELECT d.donation_id,d.member_code,d.amount,d.donated_at,d.status,d.verified_by,d.verified_at,d.receipt_no,d.receipt_issued_at,d.donor_name,COALESCE(m.phone,d.phone) AS phone,COALESCE(m.email,d.email) AS email,COALESCE(dt.title,d.topic_id,'เงินบริจาค') AS donation_type,m.prefix,m.first_name,m.last_name,COALESCE(m.full_name,d.donor_name) AS full_name,COALESCE(a.address_line,d.address_line) AS address_line,COALESCE(a.subdistrict,d.subdistrict) AS subdistrict,COALESCE(a.district,d.district) AS district,COALESCE(a.province,d.province) AS province,COALESCE(a.postal_code,d.postal_code) AS postal_code FROM donations d LEFT JOIN donation_topics dt ON dt.topic_id=d.topic_id LEFT JOIN members m ON m.member_code=d.member_code LEFT JOIN addresses a ON a.member_code=d.member_code WHERE d.donation_id=${donationId} LIMIT 1`;
        if(!rows.length)return json(request,{success:false,message:'ไม่พบรายการบริจาค'},404);if(!['ตรวจสอบแล้ว','อนุมัติ','approved','verified'].includes(String(rows[0].status||'').toLowerCase())&&!['ตรวจสอบแล้ว','อนุมัติ'].includes(String(rows[0].status||'')))return json(request,{success:false,message:'ออกใบเสร็จได้เมื่อรายการได้รับอนุมัติแล้ว'},409);
        const st=await sql`SELECT setting_key,setting_value FROM app_settings WHERE setting_key IN ('APP_NAME','CONTACT_EMAIL','BANK_ACCOUNT_NAME','BANK_NAME','BANK_ACCOUNT_NO','ASSOCIATION_ADDRESS','ASSOCIATION_STAMP','HOME_QUOTE','HOME_QUOTE_BY','HOME_NEWS_TITLE')`;const settings={};for(const r of st)settings[r.setting_key]=r.setting_value;return json(request,{success:true,data:{...rows[0],source_type:'donation',transaction_id:donationId,settings}})
      }
      if(path==="/api/admin/ledger"){
        const denied=requireAdmin(request,env);if(denied)return denied;await ensureAccountingSchema(sql);
        if(request.method==="GET"){const rows=await sql`SELECT le.entry_id,le.entry_date,le.entry_type,le.category,le.source,le.amount,le.reference_type,le.reference_id,le.member_code,le.description,le.note,le.created_by,le.status,le.created_at,le.updated_at,COALESCE(le.attachment_name,CASE WHEN p.slip_data IS NOT NULL THEN 'หลักฐานการโอน '||p.payment_id WHEN d.slip_data IS NOT NULL THEN 'หลักฐานการโอน '||d.donation_id END) AS attachment_name,COALESCE(le.attachment_type,CASE WHEN p.slip_data LIKE 'data:application/pdf%' OR d.slip_data LIKE 'data:application/pdf%' THEN 'application/pdf' WHEN p.slip_data IS NOT NULL OR d.slip_data IS NOT NULL THEN 'image/*' END) AS attachment_type,(COALESCE(le.attachment_data,p.slip_data,d.slip_data) IS NOT NULL AND COALESCE(le.attachment_data,p.slip_data,d.slip_data)<>'') AS has_attachment FROM ledger_entries le LEFT JOIN payments p ON le.reference_type='payment' AND p.payment_id=le.reference_id LEFT JOIN donations d ON le.reference_type='donation' AND d.donation_id=le.reference_id ORDER BY le.entry_date DESC,le.created_at DESC LIMIT 5000`;return json(request,{success:true,data:rows})}
        if(request.method==="POST"){
          const b=await body(request),type=clean(b.entry_type),amount=Number(b.amount||0),desc=clean(b.description),att=clean(b.attachment_data)||null;
          if(!['รายรับ','รายจ่าย'].includes(type))return json(request,{success:false,message:'กรุณาเลือกประเภทรายรับหรือรายจ่าย'},400);
          if(!desc||!Number.isFinite(amount)||amount<=0)return json(request,{success:false,message:'กรุณากรอกรายการและจำนวนเงินให้ถูกต้อง'},400);
          if(att&&!ledgerAttachmentOK(att))return json(request,{success:false,message:'หลักฐานรองรับ JPG/PNG/WEBP/PDF ขนาดไม่เกินประมาณ 2 MB'},400);
          const eid=id('LED'),admin=clean(b.created_by)||'admin';
          const snapshot={entry_id:eid,entry_date:b.entry_date||null,entry_type:type,category:clean(b.category)||'ทั่วไป',source:clean(b.source)||'บันทึกด้วยมือ',amount,reference_id:clean(b.reference_id)||eid,member_code:clean(b.member_code)||null,description:desc,note:clean(b.note)||null,attachment_name:clean(b.attachment_name)||null,attachment_type:clean(b.attachment_type)||null};
          await sql.begin(async tx=>{
            await tx`INSERT INTO ledger_entries(entry_id,entry_date,entry_type,category,source,amount,reference_type,reference_id,member_code,description,note,created_by,status,created_at,updated_at,attachment_data,attachment_name,attachment_type) VALUES(${eid},COALESCE(${b.entry_date||null}::timestamptz,NOW()),${type},${snapshot.category},${snapshot.source},${amount},'manual',${snapshot.reference_id},${snapshot.member_code},${desc},${snapshot.note},${admin},'posted',NOW(),NOW(),${att},${snapshot.attachment_name},${snapshot.attachment_type})`;
            await tx`INSERT INTO ledger_admin_logs(log_id,entry_id,action,detail,old_data,new_data,admin_by,created_at) VALUES(${id('LLOG')},${eid},'create','เพิ่มรายการบัญชีด้วยมือ',NULL,CAST(${JSON.stringify(snapshot)} AS JSONB),${admin},NOW())`;
          });
          return json(request,{success:true,entry_id:eid,message:'บันทึกรายการบัญชีแล้ว'},201)
        }
      }
      if(path==="/api/admin/ledger/logs"&&request.method==="GET"){
        const denied=requireAdmin(request,env);if(denied)return denied;await ensureAccountingSchema(sql);
        const rows=await sql`SELECT log_id,entry_id,action,detail,admin_by,created_at FROM ledger_admin_logs ORDER BY created_at DESC LIMIT 1000`;
        return json(request,{success:true,data:rows})
      }
      if(/^\/api\/admin\/ledger\/[^/]+$/.test(path)&&request.method==="GET"){
        const denied=requireAdmin(request,env);if(denied)return denied;await ensureAccountingSchema(sql);const eid=decodeURIComponent(path.split('/').pop());
        const rows=await sql`SELECT le.*,COALESCE(le.attachment_data,p.slip_data,d.slip_data) AS attachment_data,COALESCE(le.attachment_name,CASE WHEN p.slip_data IS NOT NULL THEN 'หลักฐานการโอน '||p.payment_id WHEN d.slip_data IS NOT NULL THEN 'หลักฐานการโอน '||d.donation_id END) AS attachment_name,COALESCE(le.attachment_type,CASE WHEN p.slip_data LIKE 'data:application/pdf%' OR d.slip_data LIKE 'data:application/pdf%' THEN 'application/pdf' WHEN p.slip_data IS NOT NULL OR d.slip_data IS NOT NULL THEN 'image/*' END) AS attachment_type FROM ledger_entries le LEFT JOIN payments p ON le.reference_type='payment' AND p.payment_id=le.reference_id LEFT JOIN donations d ON le.reference_type='donation' AND d.donation_id=le.reference_id WHERE le.entry_id=${eid} LIMIT 1`;if(!rows.length)return json(request,{success:false,message:'ไม่พบรายการบัญชี'},404);return json(request,{success:true,data:rows[0]})
      }
      if(/^\/api\/admin\/ledger\/[^/]+\/logs$/.test(path)&&request.method==="GET"){
        const denied=requireAdmin(request,env);if(denied)return denied;await ensureAccountingSchema(sql);const eid=decodeURIComponent(path.split('/')[4]);
        const rows=await sql`SELECT log_id,entry_id,action,detail,admin_by,created_at FROM ledger_admin_logs WHERE entry_id=${eid} ORDER BY created_at DESC LIMIT 500`;
        return json(request,{success:true,data:rows})
      }
      if(/^\/api\/admin\/ledger\/[^/]+$/.test(path)&&request.method==="PUT"){
        const denied=requireAdmin(request,env);if(denied)return denied;await ensureAccountingSchema(sql);const eid=decodeURIComponent(path.split('/').pop()),b=await body(request);
        const before=await sql`SELECT * FROM ledger_entries WHERE entry_id=${eid} LIMIT 1`;if(!before.length)return json(request,{success:false,message:'ไม่พบรายการบัญชี'},404);
        if(String(before[0].reference_type||'')!=='manual')return json(request,{success:false,message:'แก้ไขได้เฉพาะรายการบัญชีที่บันทึกด้วยมือ'},409);
        const type=clean(b.entry_type),amount=Number(b.amount||0),desc=clean(b.description),hasNew=!!clean(b.attachment_data),remove=!!b.remove_attachment,att=hasNew?clean(b.attachment_data):null;
        if(!['รายรับ','รายจ่าย'].includes(type)||!desc||!Number.isFinite(amount)||amount<=0)return json(request,{success:false,message:'กรุณากรอกข้อมูลบัญชีให้ถูกต้อง'},400);
        if(att&&!ledgerAttachmentOK(att))return json(request,{success:false,message:'หลักฐานรองรับ JPG/PNG/WEBP/PDF ขนาดไม่เกินประมาณ 2 MB'},400);
        const admin=clean(b.updated_by)||'admin',oldLog={...before[0],attachment_data:before[0].attachment_data?'[มีไฟล์หลักฐาน]':null},after={entry_date:b.entry_date||before[0].entry_date,entry_type:type,category:clean(b.category)||'ทั่วไป',source:clean(b.source)||'บันทึกด้วยมือ',amount,reference_id:clean(b.reference_id)||before[0].reference_id,description:desc,note:clean(b.note)||null,attachment_name:hasNew?clean(b.attachment_name)||null:(remove?null:before[0].attachment_name),attachment_type:hasNew?clean(b.attachment_type)||null:(remove?null:before[0].attachment_type)};
        await sql.begin(async tx=>{
          await tx`UPDATE ledger_entries SET entry_date=COALESCE(${b.entry_date||null}::timestamptz,entry_date),entry_type=${type},category=${after.category},source=${after.source},amount=${amount},reference_id=${after.reference_id},description=${desc},note=${after.note},attachment_data=CASE WHEN ${hasNew} THEN ${att} WHEN ${remove} THEN NULL ELSE attachment_data END,attachment_name=CASE WHEN ${hasNew} THEN ${after.attachment_name} WHEN ${remove} THEN NULL ELSE attachment_name END,attachment_type=CASE WHEN ${hasNew} THEN ${after.attachment_type} WHEN ${remove} THEN NULL ELSE attachment_type END,updated_at=NOW() WHERE entry_id=${eid}`;
          await tx`INSERT INTO ledger_admin_logs(log_id,entry_id,action,detail,old_data,new_data,admin_by,created_at) VALUES(${id('LLOG')},${eid},'edit',${remove?'แก้ไขรายการบัญชีและลบหลักฐานเดิม':hasNew?'แก้ไขรายการบัญชีและเปลี่ยนหลักฐาน':'แก้ไขรายการบัญชี'},CAST(${JSON.stringify(oldLog)} AS JSONB),CAST(${JSON.stringify(after)} AS JSONB),${admin},NOW())`;
        });
        return json(request,{success:true,message:'บันทึกการแก้ไขรายการบัญชีแล้ว'})
      }
      if(/^\/api\/admin\/ledger\/[^/]+$/.test(path)&&request.method==="DELETE"){
        const denied=requireAdmin(request,env);if(denied)return denied;await ensureAccountingSchema(sql);const eid=decodeURIComponent(path.split('/').pop());const rows=await sql`SELECT * FROM ledger_entries WHERE entry_id=${eid} LIMIT 1`;if(!rows.length)return json(request,{success:false,message:'ไม่พบรายการบัญชี'},404);if(String(rows[0].reference_type||'')!=='manual')return json(request,{success:false,message:'รายการอัตโนมัติจากธุรกรรมไม่สามารถลบได้'},409);
        const oldLog={...rows[0],attachment_data:rows[0].attachment_data?'[มีไฟล์หลักฐาน]':null};await sql.begin(async tx=>{await tx`INSERT INTO ledger_admin_logs(log_id,entry_id,action,detail,old_data,new_data,admin_by,created_at) VALUES(${id('LLOG')},${eid},'delete','ลบรายการบัญชีที่บันทึกด้วยมือ',CAST(${JSON.stringify(oldLog)} AS JSONB),NULL,'admin',NOW())`;await tx`DELETE FROM ledger_entries WHERE entry_id=${eid}`});
        return json(request,{success:true,message:'ลบรายการบัญชีแล้ว'})
      }
      if(path==="/api/admin/news"&&request.method==="GET"){
        const denied=requireAdmin(request,env);if(denied)return denied;await ensureNewsSchema(sql);
        const rows=await sql`SELECT news_id,category,title,content,publish_date,image_data,image_name,featured,active,created_at,updated_at FROM news ORDER BY publish_date DESC,created_at DESC LIMIT 1000`;
        return json(request,{success:true,data:rows});
      }
      if(path==="/api/admin/news"&&request.method==="POST"){
        const denied=requireAdmin(request,env);if(denied)return denied;await ensureNewsSchema(sql);const b=await body(request),nid=id('NEWS'),img=clean(b.image_data);
        if(!clean(b.title)||!clean(b.content))return json(request,{success:false,message:"กรุณากรอกหัวข้อและเนื้อหา"},400);
        if(img&&!newsImageOK(img))return json(request,{success:false,message:"รูปข่าวรองรับ JPG/PNG/WEBP · ข่าว/ประกาศ 1 รูป · กิจกรรมสูงสุด 10 รูป ระบบย่อรูปอัตโนมัติ (หลังย่อแต่ละรูปไม่เกินประมาณ 650 KB และรวมไม่เกินประมาณ 5 MB)"},400);
        const cat=['ข่าวสาร','ประกาศ','กิจกรรม'].includes(clean(b.category))?clean(b.category):'ข่าวสาร';
        await sql`INSERT INTO news(news_id,category,title,content,publish_date,active,created_at,updated_at,image_data,image_name,featured) VALUES(${nid},${cat},${clean(b.title)},${clean(b.content)},COALESCE(${b.publish_date||null}::timestamptz,NOW()),${b.active!==false},NOW(),NOW(),${img||null},${clean(b.image_name)||null},${!!b.featured})`;
        return json(request,{success:true,news_id:nid},201)
      }
      if(/^\/api\/admin\/news\/[^/]+$/.test(path)&&request.method==="PUT"){
        const denied=requireAdmin(request,env);if(denied)return denied;await ensureNewsSchema(sql);const nid=decodeURIComponent(path.split('/').pop()),b=await body(request),img=clean(b.image_data),remove=!!b.remove_image;
        const before=await sql`SELECT news_id FROM news WHERE news_id=${nid} LIMIT 1`;if(!before.length)return json(request,{success:false,message:'ไม่พบข่าวสาร'},404);
        if(!clean(b.title)||!clean(b.content))return json(request,{success:false,message:'กรุณากรอกหัวข้อและเนื้อหา'},400);
        if(img&&!newsImageOK(img))return json(request,{success:false,message:'รูปข่าวรองรับ JPG/PNG/WEBP · ข่าว/ประกาศ 1 รูป · กิจกรรมสูงสุด 10 รูป ระบบย่อรูปอัตโนมัติ (หลังย่อแต่ละรูปไม่เกินประมาณ 650 KB และรวมไม่เกินประมาณ 5 MB)'},400);
        const cat=['ข่าวสาร','ประกาศ','กิจกรรม'].includes(clean(b.category))?clean(b.category):'ข่าวสาร';
        await sql`UPDATE news SET category=${cat},title=${clean(b.title)},content=${clean(b.content)},publish_date=COALESCE(${b.publish_date||null}::timestamptz,publish_date),active=${b.active!==false},featured=${!!b.featured},image_data=CASE WHEN ${!!img} THEN ${img||null} WHEN ${remove} THEN NULL ELSE image_data END,image_name=CASE WHEN ${!!img} THEN ${clean(b.image_name)||null} WHEN ${remove} THEN NULL ELSE image_name END,updated_at=NOW() WHERE news_id=${nid}`;
        return json(request,{success:true,message:'บันทึกการแก้ไขแล้ว'})
      }
      if(/^\/api\/admin\/news\/[^/]+$/.test(path)&&request.method==="DELETE"){
        const denied=requireAdmin(request,env);if(denied)return denied;await ensureNewsSchema(sql);const nid=decodeURIComponent(path.split('/').pop());
        const rows=await sql`DELETE FROM news WHERE news_id=${nid} RETURNING news_id`;if(!rows.length)return json(request,{success:false,message:'ไม่พบข่าวสาร'},404);
        return json(request,{success:true,message:'ลบข่าวสารแล้ว'})
      }
      if(path==="/api/admin/media"&&request.method==="GET"){
        const denied=requireAdmin(request,env);if(denied)return denied;await ensureMediaSchema(sql);
        const rows=await sql`SELECT media_id,file_name,category,mime_type,image_data,size_bytes,created_by,created_at,updated_at FROM media_library ORDER BY created_at DESC LIMIT 500`;
        return json(request,{success:true,data:rows});
      }
      if(path==="/api/admin/media"&&request.method==="POST"){
        const denied=requireAdmin(request,env);if(denied)return denied;await ensureMediaSchema(sql);const b=await body(request),img=clean(b.image_data),name=clean(b.file_name)||'image.jpg',cat=clean(b.category)||'ข่าวสาร';
        if(!mediaImageOK(img))return json(request,{success:false,message:'รูปต้องเป็น JPG/PNG/WEBP และหลังย่อไม่เกินประมาณ 650 KB'},400);
        const comma=img.indexOf(','),bytes=comma>=0?Math.floor((img.length-comma-1)*0.75):0,mid=id('MEDIA');
        await sql`INSERT INTO media_library(media_id,file_name,category,mime_type,image_data,size_bytes,created_by,created_at,updated_at) VALUES(${mid},${name},${cat},${clean(b.mime_type)||'image/jpeg'},${img},${bytes},${clean(b.created_by)||'admin'},NOW(),NOW())`;
        return json(request,{success:true,media_id:mid},201);
      }
      if(/^\/api\/admin\/media\/[^/]+$/.test(path)&&request.method==="DELETE"){
        const denied=requireAdmin(request,env);if(denied)return denied;await ensureMediaSchema(sql);const mid=decodeURIComponent(path.split('/').pop());
        const rows=await sql`DELETE FROM media_library WHERE media_id=${mid} RETURNING media_id`;if(!rows.length)return json(request,{success:false,message:'ไม่พบรูปในคลัง'},404);
        return json(request,{success:true,message:'ลบรูปจากคลังแล้ว'});
      }

      if(path==="/api/admin/benefits"&&request.method==="POST"){const denied=requireAdmin(request,env);if(denied)return denied;const b=await body(request),bid=id('BEN');if(!clean(b.title))return json(request,{success:false,message:"กรุณากรอกชื่อสิทธิประโยชน์"},400);await sql`INSERT INTO benefits(benefit_id,title,description,start_date,end_date,active,created_at,updated_at) VALUES(${bid},${clean(b.title)},${clean(b.description)||null},${b.start_date||null},${b.end_date||null},TRUE,NOW(),NOW())`;return json(request,{success:true,benefit_id:bid},201)}
      if(path==="/api/admin/settings"&&request.method==="GET"){
        const denied=requireAdmin(request,env);if(denied)return denied;await ensureV2616Schema(sql);
        const rows=await sql`SELECT setting_key,setting_value FROM app_settings ORDER BY setting_key`;
        const data={};for(const r of rows)data[r.setting_key]=r.setting_value;
        return json(request,{success:true,data});
      }
      if(path==="/api/admin/settings"&&request.method==="PUT"){
        const denied=requireAdmin(request,env);if(denied)return denied;await ensureV2616Schema(sql);const b=await body(request);
        const allowed=['APP_NAME','MEMBERSHIP_FEE_YEARLY','MEMBERSHIP_FEE_MONTHLY','PROMPTPAY','BANK_ACCOUNT_NAME','BANK_NAME','BANK_ACCOUNT_NO','CONTACT_EMAIL','ASSOCIATION_ADDRESS','ASSOCIATION_STAMP','HOME_QUOTE','HOME_QUOTE_BY','HOME_NEWS_TITLE'];
        for(const [k,v] of Object.entries(b)){if(!allowed.includes(k))continue;await sql`INSERT INTO app_settings(setting_key,setting_value,updated_at) VALUES(${k},${clean(v)},NOW()) ON CONFLICT(setting_key) DO UPDATE SET setting_value=EXCLUDED.setting_value,updated_at=NOW()`}
        await sql`INSERT INTO app_settings(setting_key,setting_value,updated_at) VALUES('APP_VERSION','V2.6.57',NOW()) ON CONFLICT(setting_key) DO UPDATE SET setting_value=EXCLUDED.setting_value,updated_at=NOW()`;
        if(Object.prototype.hasOwnProperty.call(b,'MEMBERSHIP_FEE_YEARLY')){const fee=Number(b.MEMBERSHIP_FEE_YEARLY||0)||null;await sql`INSERT INTO payment_topics(topic_id,title,description,amount,active,created_at,updated_at) VALUES('membership','ค่าบำรุงสมาคมศิษย์เก่าฯ รายปี','สนับสนุนสมาคมฯ รายปี',${fee},TRUE,NOW(),NOW()) ON CONFLICT(topic_id) DO UPDATE SET title=EXCLUDED.title,description=EXCLUDED.description,amount=EXCLUDED.amount,active=TRUE,updated_at=NOW()`}
        return json(request,{success:true,message:"บันทึกการตั้งค่าแล้ว"})
      }

      return json(request,{success:false,message:"API endpoint not found"},404);
    }catch(error){console.error("SK Alumni API Error",error);return json(request,{success:false,message:"Internal server error",error:String(error?.message||error),code:error?.code||null},500)}finally{if(sql)await sql.end().catch(()=>{})}
  }
};
