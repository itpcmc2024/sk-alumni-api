import { Client } from "pg";

function cors(request){
  return {
    "Access-Control-Allow-Origin":"*",
    "Access-Control-Allow-Methods":"GET,POST,PUT,PATCH,DELETE,OPTIONS",
    "Access-Control-Allow-Headers":"Content-Type, Authorization, X-Admin-Key",
    "Access-Control-Max-Age":"86400",
    "Content-Type":"application/json; charset=utf-8",
    "X-Robots-Tag":"noindex, nofollow"
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
function memberStatusText(s){s=String(s||"").toLowerCase();if(["active","ใช้งาน","approved","สมาชิกสมบูรณ์"].includes(s))return"active";if(["cancelled","canceled","rejected","ยกเลิก","ไม่อนุมัติ"].includes(s))return"cancelled";if(["renewal","รอต่ออายุ","รอต่ออายุสมาชิก"].includes(s))return"renewal";return"pending"}
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

export default {
  async fetch(request,env){
    if(request.method==="OPTIONS") return new Response(null,{status:204,headers:cors(request)});
    const url=new URL(request.url), path=url.pathname.replace(/\/+$/,"")||"/";
    let sql=null;
    try{
      if(path==="/") return json(request,{success:true,app:"SK Alumni API",version:"2.6.11",status:"online"});
      sql=db(env);
      if(path==="/api/health"&&request.method==="GET"){
        const r=await sql`SELECT current_database() database,NOW() server_time`;
        return json(request,{success:true,service:"sk-alumni-api",database:r[0].database,server_time:r[0].server_time,version:"2.6.11"});
      }

      if(path==="/api/settings/public"&&request.method==="GET"){
        const rows=await sql`SELECT setting_key,setting_value FROM app_settings WHERE setting_key IN ('APP_NAME','APP_VERSION','MEMBERSHIP_FEE_YEARLY','MEMBERSHIP_FEE_MONTHLY','PROMPTPAY','CONTACT_EMAIL') ORDER BY setting_key`;
        const data={};for(const r of rows)data[r.setting_key]=r.setting_value;
        return json(request,{success:true,data});
      }

      if(path==="/api/payment-topics/public"&&request.method==="GET"){
        let rows=await sql`SELECT topic_id,title,description,amount FROM payment_topics WHERE active=TRUE ORDER BY created_at, title`;
        if(!rows.length){
          const feeRows=await sql`SELECT setting_value FROM app_settings WHERE setting_key='MEMBERSHIP_FEE_YEARLY' LIMIT 1`;
          const fee=Number(feeRows[0]?.setting_value||0)||null;
          await sql`INSERT INTO payment_topics(topic_id,title,description,amount,active,created_at,updated_at) VALUES('membership','ชำระค่าสมาชิก','ค่าบำรุงสมาชิกรายปี',${fee},TRUE,NOW(),NOW()) ON CONFLICT(topic_id) DO NOTHING`;
          rows=await sql`SELECT topic_id,title,description,amount FROM payment_topics WHERE active=TRUE ORDER BY created_at, title`;
        }
        return json(request,{success:true,data:rows});
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
              ${photo||null},'pending',TRUE,NOW(),NOW(),NOW()
            )
          `;
          await tx`INSERT INTO addresses(member_code,address_line,subdistrict,district,province,postal_code,updated_at) VALUES(${code},${clean(b.address_line)||null},${clean(b.subdistrict)||null},${clean(b.district)||null},${clean(b.province)||null},${clean(b.postal_code)||null},NOW()) ON CONFLICT(member_code) DO UPDATE SET address_line=EXCLUDED.address_line,subdistrict=EXCLUDED.subdistrict,district=EXCLUDED.district,province=EXCLUDED.province,postal_code=EXCLUDED.postal_code,updated_at=NOW()`;
        });
        return json(request,{success:true,message:"ลงทะเบียนเรียบร้อยแล้ว",member_code:code,data:{member_code:code,status:"pending"}},201);
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
            module_warnings:moduleWarnings
          }
        });
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
        let paymentType=clean(b.payment_type)||'ชำระค่าสมาชิก';
        if(topicId){const tr=await sql`SELECT title,amount FROM payment_topics WHERE topic_id=${topicId} AND active=TRUE LIMIT 1`;if(!tr.length)return json(request,{success:false,message:"ไม่พบหัวข้อการชำระที่เปิดใช้งาน"},400);paymentType=tr[0].title;if(tr[0].amount!=null&&Math.abs(Number(tr[0].amount)-amount)>0.009)return json(request,{success:false,message:"ยอดชำระไม่ตรงกับยอดที่ Admin กำหนด"},400);}
        await sql`ALTER TABLE payments ADD COLUMN IF NOT EXISTS slip_data TEXT`;
        const paymentId=id('PAY');
        await sql`INSERT INTO payments(payment_id,member_code,topic_id,payment_type,amount,paid_at,status,note,created_at,updated_at,slip_data) VALUES(${paymentId},${code},${topicId},${paymentType},${amount},${b.paid_at||new Date().toISOString()},'รอตรวจสอบการชำระ',${clean(b.note)||null},NOW(),NOW(),${slip})`;
        return json(request,{success:true,payment_id:paymentId,status:'รอตรวจสอบการชำระ'},201);
      }

      if(path==="/api/donations"&&request.method==="POST"){
        const b=await body(request),amount=Number(b.amount||0);if(amount<=0||!clean(b.donor_name))return json(request,{success:false,message:"ข้อมูลบริจาคไม่ครบ"},400);const donationId=id('DON');
        await sql`INSERT INTO donations(donation_id,member_code,topic_id,amount,donated_at,slip_url,status,donor_name,phone,email,created_at,updated_at) VALUES(${donationId},${clean(b.member_code)||null},${clean(b.topic_id)||null},${amount},NOW(),${clean(b.slip_url)||null},'รอตรวจสอบ',${clean(b.donor_name)},${clean(b.phone)||null},${clean(b.email)||null},NOW(),NOW())`;
        return json(request,{success:true,donation_id:donationId},201);
      }

      if(path==="/api/news"&&request.method==="GET"){
        const rows=await sql`SELECT news_id,category,title,content,publish_date FROM news WHERE active=TRUE ORDER BY publish_date DESC LIMIT 50`;
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
      if(/^\/api\/admin\/members\/[^/]+$/.test(path)){
        const denied=requireAdmin(request,env);if(denied)return denied;const code=decodeURIComponent(path.split('/').pop()).toUpperCase();
        if(request.method==="GET"){
          const rows=await sql`SELECT m.*,a.address_line,a.subdistrict,a.district,a.province,a.postal_code FROM members m LEFT JOIN addresses a ON a.member_code=m.member_code WHERE m.member_code=${code} LIMIT 1`;if(!rows.length)return json(request,{success:false,message:"ไม่พบสมาชิก"},404);return json(request,{success:true,data:{...rows[0],status:memberStatusText(rows[0].status)}});
        }
        if(request.method==="PUT"||request.method==="PATCH"){
          const b=await body(request);const full=[clean(b.first_name),clean(b.last_name)].filter(Boolean).join(' ')||clean(b.full_name);
          await sql.begin(async tx=>{await tx`UPDATE members SET prefix=COALESCE(NULLIF(${clean(b.prefix)},''),prefix),first_name=COALESCE(NULLIF(${clean(b.first_name)},''),first_name),last_name=COALESCE(NULLIF(${clean(b.last_name)},''),last_name),full_name=COALESCE(NULLIF(${full},''),full_name),arabic_name=${clean(b.arabic_name)||null},phone=COALESCE(NULLIF(${clean(b.phone)},''),phone),email=${clean(b.email)||null},line_id=${clean(b.line_id)||null},line_user_id=${clean(b.line_id)||null},photo_data=COALESCE(NULLIF(${clean(b.photo_data)},''),photo_data),status=COALESCE(NULLIF(${clean(b.status)},''),status),updated_at=NOW() WHERE member_code=${code}`;await tx`INSERT INTO addresses(member_code,address_line,subdistrict,district,province,postal_code,updated_at) VALUES(${code},${clean(b.address_line)||null},${clean(b.subdistrict)||null},${clean(b.district)||null},${clean(b.province)||null},${clean(b.postal_code)||null},NOW()) ON CONFLICT(member_code) DO UPDATE SET address_line=EXCLUDED.address_line,subdistrict=EXCLUDED.subdistrict,district=EXCLUDED.district,province=EXCLUDED.province,postal_code=EXCLUDED.postal_code,updated_at=NOW()`});
          return json(request,{success:true,message:"บันทึกแล้ว"});
        }
      }
      if(/^\/api\/admin\/members\/[^/]+\/status$/.test(path)&&request.method==="PATCH"){
        const denied=requireAdmin(request,env);if(denied)return denied;const code=decodeURIComponent(path.split('/')[4]).toUpperCase(),b=await body(request),st=memberStatusText(b.status);await sql`UPDATE members SET status=${st},member_start=CASE WHEN ${st}='active' AND member_start IS NULL THEN NOW() ELSE member_start END,member_expire=CASE WHEN ${st}='active' AND member_expire IS NULL THEN NOW()+INTERVAL '1 year' ELSE member_expire END,updated_at=NOW() WHERE member_code=${code}`;return json(request,{success:true,status:st});
      }

      if(path==="/api/admin/payment-topics"){
        const denied=requireAdmin(request,env);if(denied)return denied;
        if(request.method==="GET"){const rows=await sql`SELECT topic_id,title,description,amount,active,created_at,updated_at FROM payment_topics ORDER BY created_at,title`;return json(request,{success:true,data:rows})}
        if(request.method==="POST"){
          const b=await body(request),title=clean(b.title),amount=b.amount===''||b.amount==null?null:Number(b.amount);if(!title)return json(request,{success:false,message:"กรุณากรอกหัวข้อรายการ"},400);if(amount!=null&&(!Number.isFinite(amount)||amount<0))return json(request,{success:false,message:"ยอดเงินไม่ถูกต้อง"},400);
          const tid=clean(b.topic_id)||id('TOPIC');await sql`INSERT INTO payment_topics(topic_id,title,description,amount,active,created_at,updated_at) VALUES(${tid},${title},${clean(b.description)||null},${amount},${b.active!==false},NOW(),NOW()) ON CONFLICT(topic_id) DO UPDATE SET title=EXCLUDED.title,description=EXCLUDED.description,amount=EXCLUDED.amount,active=EXCLUDED.active,updated_at=NOW()`;return json(request,{success:true,topic_id:tid,message:"บันทึกหัวข้อการชำระแล้ว"},201)
        }
      }
      if(/^\/api\/admin\/payment-topics\/[^/]+$/.test(path)&&request.method==="DELETE"){
        const denied=requireAdmin(request,env);if(denied)return denied;const tid=decodeURIComponent(path.split('/').pop());await sql`UPDATE payment_topics SET active=FALSE,updated_at=NOW() WHERE topic_id=${tid}`;return json(request,{success:true,message:"ปิดใช้งานหัวข้อแล้ว"});
      }
      if(/^\/api\/admin\/payments\/[^/]+\/verify$/.test(path)&&request.method==="PATCH"){
        const denied=requireAdmin(request,env);if(denied)return denied;const paymentId=decodeURIComponent(path.split('/')[4]),b=await body(request),approve=String(b.action||'approve').toLowerCase()==='approve',admin=clean(b.verified_by)||'admin';
        const rows=await sql`SELECT payment_id,member_code,payment_type,amount,status,paid_at FROM payments WHERE payment_id=${paymentId} LIMIT 1`;if(!rows.length)return json(request,{success:false,message:"ไม่พบรายการชำระ"},404);const pay=rows[0];
        if(pay.status==='ชำระแล้ว')return json(request,{success:true,message:"รายการนี้ยืนยันแล้ว"});
        if(!approve){await sql`UPDATE payments SET status='ไม่อนุมัติ',verified_by=${admin},verified_at=NOW(),note=COALESCE(NULLIF(${clean(b.note)},''),note),updated_at=NOW() WHERE payment_id=${paymentId}`;return json(request,{success:true,message:"บันทึกไม่อนุมัติแล้ว"})}
        await sql.begin(async tx=>{
          await tx`UPDATE payments SET status='ชำระแล้ว',verified_by=${admin},verified_at=NOW(),note=COALESCE(NULLIF(${clean(b.note)},''),note),updated_at=NOW() WHERE payment_id=${paymentId}`;
          await tx`UPDATE members SET status='active',member_start=COALESCE(member_start,NOW()),member_expire=(CASE WHEN member_expire IS NULL OR member_expire<NOW() THEN NOW() ELSE member_expire END)+INTERVAL '1 year',updated_at=NOW() WHERE member_code=${pay.member_code}`;
          await tx`INSERT INTO ledger_entries(entry_id,entry_date,entry_type,category,source,amount,reference_type,reference_id,member_code,description,note,created_by,status,created_at,updated_at) VALUES(${id('LED')},NOW(),'รายรับ','ค่าสมาชิก',${pay.payment_type},${pay.amount},'payment',${pay.payment_id},${pay.member_code},${'รับชำระค่าสมาชิก '+pay.member_code},${clean(b.note)||null},${admin},'posted',NOW(),NOW()) ON CONFLICT(reference_type,reference_id,entry_type) DO NOTHING`;
        });
        return json(request,{success:true,message:"ยืนยันการชำระแล้ว ต่ออายุสมาชิก 1 ปี และลงบัญชีรายรับเรียบร้อย"});
      }

      if(path==="/api/admin/payments"&&request.method==="GET"){const denied=requireAdmin(request,env);if(denied)return denied;const rows=await sql`SELECT * FROM payments ORDER BY created_at DESC LIMIT 500`;return json(request,{success:true,data:rows})}
      if(path==="/api/admin/donations"&&request.method==="GET"){const denied=requireAdmin(request,env);if(denied)return denied;const rows=await sql`SELECT * FROM donations ORDER BY created_at DESC LIMIT 500`;return json(request,{success:true,data:rows})}
      if(path==="/api/admin/news"&&request.method==="POST"){const denied=requireAdmin(request,env);if(denied)return denied;const b=await body(request),nid=id('NEWS');if(!clean(b.title)||!clean(b.content))return json(request,{success:false,message:"กรุณากรอกหัวข้อและเนื้อหา"},400);await sql`INSERT INTO news(news_id,category,title,content,publish_date,active,created_at,updated_at) VALUES(${nid},${clean(b.category)||'ข่าวสาร'},${clean(b.title)},${clean(b.content)},NOW(),TRUE,NOW(),NOW())`;return json(request,{success:true,news_id:nid},201)}
      if(path==="/api/admin/benefits"&&request.method==="POST"){const denied=requireAdmin(request,env);if(denied)return denied;const b=await body(request),bid=id('BEN');if(!clean(b.title))return json(request,{success:false,message:"กรุณากรอกชื่อสิทธิประโยชน์"},400);await sql`INSERT INTO benefits(benefit_id,title,description,start_date,end_date,active,created_at,updated_at) VALUES(${bid},${clean(b.title)},${clean(b.description)||null},${b.start_date||null},${b.end_date||null},TRUE,NOW(),NOW())`;return json(request,{success:true,benefit_id:bid},201)}
      if(path==="/api/admin/settings"&&request.method==="PUT"){const denied=requireAdmin(request,env);if(denied)return denied;const b=await body(request);for(const [k,v] of Object.entries(b)){if(!['APP_NAME','MEMBERSHIP_FEE_YEARLY','MEMBERSHIP_FEE_MONTHLY','PROMPTPAY','CONTACT_EMAIL'].includes(k))continue;await sql`INSERT INTO app_settings(setting_key,setting_value,updated_at) VALUES(${k},${clean(v)},NOW()) ON CONFLICT(setting_key) DO UPDATE SET setting_value=EXCLUDED.setting_value,updated_at=NOW()`}if(Object.prototype.hasOwnProperty.call(b,'MEMBERSHIP_FEE_YEARLY')){const fee=Number(b.MEMBERSHIP_FEE_YEARLY||0)||null;await sql`INSERT INTO payment_topics(topic_id,title,description,amount,active,created_at,updated_at) VALUES('membership','ชำระค่าสมาชิก','ค่าบำรุงสมาชิกรายปี',${fee},TRUE,NOW(),NOW()) ON CONFLICT(topic_id) DO UPDATE SET amount=EXCLUDED.amount,updated_at=NOW()`}return json(request,{success:true,message:"บันทึกการตั้งค่าแล้ว"})}

      return json(request,{success:false,message:"API endpoint not found"},404);
    }catch(error){console.error("SK Alumni API Error",error);return json(request,{success:false,message:"Internal server error",error:String(error?.message||error),code:error?.code||null},500)}finally{if(sql)await sql.end().catch(()=>{})}
  }
};
