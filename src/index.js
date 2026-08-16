import postgres from "postgres";

const ALLOWED_ORIGINS = ["https://itpcmc2024.github.io"];

function cors(request){
  const origin=request.headers.get("Origin")||"";
  return {
    "Access-Control-Allow-Origin":ALLOWED_ORIGINS.includes(origin)?origin:ALLOWED_ORIGINS[0],
    "Access-Control-Allow-Methods":"GET,POST,PUT,PATCH,DELETE,OPTIONS",
    "Access-Control-Allow-Headers":"Content-Type, Authorization, X-Admin-Key",
    "Access-Control-Max-Age":"86400","Vary":"Origin",
    "Content-Type":"application/json; charset=utf-8","X-Robots-Tag":"noindex, nofollow"
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
function memberStatusText(s){s=String(s||"").toLowerCase();if(["active","ใช้งาน","approved","สมาชิกสมบูรณ์"].includes(s))return"active";if(["cancelled","canceled","rejected","ยกเลิก","ไม่อนุมัติ"].includes(s))return"cancelled";return"pending"}
function id(prefix){return `${prefix}-${Date.now()}-${crypto.randomUUID().slice(0,8)}`}
async function body(request){try{return await request.json()}catch{return {}}}

export default {
  async fetch(request,env){
    if(request.method==="OPTIONS") return new Response(null,{status:204,headers:cors(request)});
    const url=new URL(request.url), path=url.pathname.replace(/\/+$/,"")||"/";
    const sql=postgres(env.HYPERDRIVE.connectionString,{max:5,fetch_types:false,prepare:true});
    try{
      if(path==="/") return json(request,{success:true,app:"SK Alumni API",version:"2.0.0",status:"online"});
      if(path==="/api/health"&&request.method==="GET"){
        const r=await sql`SELECT current_database() database,NOW() server_time`;
        return json(request,{success:true,service:"sk-alumni-api",database:r[0].database,server_time:r[0].server_time,version:"2.0.0"});
      }

      if(path==="/api/settings/public"&&request.method==="GET"){
        const rows=await sql`SELECT setting_key,setting_value FROM app_settings WHERE setting_key IN ('APP_NAME','APP_VERSION','MEMBERSHIP_FEE_YEARLY','MEMBERSHIP_FEE_MONTHLY','PROMPTPAY','CONTACT_EMAIL') ORDER BY setting_key`;
        const data={};for(const r of rows)data[r.setting_key]=r.setting_value;
        return json(request,{success:true,data});
      }

      if(path==="/api/members/register"&&request.method==="POST"){
        const b=await body(request);const prefix=clean(b.prefix),first=clean(b.first_name),last=clean(b.last_name),phone=clean(b.phone),email=clean(b.email).toLowerCase();
        if(!prefix||!first||!last||!/^\d{9,10}$/.test(phone))return json(request,{success:false,message:"ข้อมูลลงทะเบียนไม่ครบหรือเบอร์โทรไม่ถูกต้อง"},400);
        if(email&&!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))return json(request,{success:false,message:"รูปแบบอีเมลไม่ถูกต้อง"},400);
        const dup=await sql`SELECT member_code FROM members WHERE phone=${phone} OR (${email}<>'' AND LOWER(COALESCE(email,''))=${email}) LIMIT 1`;
        if(dup.length)return json(request,{success:false,duplicate:true,member_code:dup[0].member_code,message:"พบข้อมูลที่อาจลงทะเบียนไว้แล้ว"},409);
        const yy=String(new Date().getFullYear()+543).slice(-2);
        const seq=await sql`SELECT COALESCE(MAX(NULLIF(regexp_replace(member_code,'\\D','','g'),'')::bigint),0)+1 n FROM members WHERE member_code LIKE ${yy+'-SK%'}`;
        const code=`${yy}-SK${String(seq[0].n||1).padStart(4,'0')}`;
        const full=`${first} ${last}`.trim();
        await sql.begin(async tx=>{
          await tx`INSERT INTO members(member_code,prefix,full_name,arabic_name,email,phone,line_user_id,status,consent_at,registered_at,updated_at) VALUES(${code},${prefix},${full},${clean(b.arabic_name)||null},${email||null},${phone},${clean(b.line_id)||null},'pending',NOW(),NOW(),NOW())`;
          await tx`INSERT INTO addresses(member_code,address_line,subdistrict,district,province,postal_code,updated_at) VALUES(${code},${clean(b.address_line)||null},${clean(b.subdistrict)||null},${clean(b.district)||null},${clean(b.province)||null},${clean(b.postal_code)||null},NOW()) ON CONFLICT(member_code) DO UPDATE SET address_line=EXCLUDED.address_line,subdistrict=EXCLUDED.subdistrict,district=EXCLUDED.district,province=EXCLUDED.province,postal_code=EXCLUDED.postal_code,updated_at=NOW()`;
        });
        return json(request,{success:true,message:"ลงทะเบียนเรียบร้อยแล้ว",member_code:code,data:{member_code:code,status:"pending"}},201);
      }

      if(/^\/api\/status\//.test(path)&&request.method==="GET"){
        const code=decodeURIComponent(path.split('/').pop()).toUpperCase();
        const rows=await sql`SELECT member_code,prefix,full_name,arabic_name,status,registered_at,member_start,member_expire FROM members WHERE member_code=${code} LIMIT 1`;
        if(!rows.length)return json(request,{success:true,found:false,message:"ไม่พบข้อมูลสมาชิก"},404);
        return json(request,{success:true,found:true,data:{...rows[0],status:memberStatusText(rows[0].status)}});
      }

      if(path==="/api/member/login"&&request.method==="POST"){
        const b=await body(request);const code=clean(b.member_code).toUpperCase(),identity=clean(b.identity).toLowerCase();
        const rows=await sql`SELECT m.member_code,m.prefix,m.full_name,m.arabic_name,m.status,m.email,m.phone,m.member_start,m.member_expire,a.address_line,a.subdistrict,a.district,a.province,a.postal_code FROM members m LEFT JOIN addresses a ON a.member_code=m.member_code WHERE m.member_code=${code} LIMIT 1`;
        if(!rows.length)return json(request,{success:false,message:"ไม่พบข้อมูลสมาชิก"},404);const m=rows[0];
        if(memberStatusText(m.status)!=="active")return json(request,{success:false,message:"สมาชิกยังไม่อยู่ในสถานะใช้งาน"},403);
        const ok=(m.email&&String(m.email).toLowerCase()===identity)||(m.phone&&String(m.phone).replace(/\D/g,'')===identity.replace(/\D/g,''));
        if(!ok)return json(request,{success:false,message:"อีเมลหรือเบอร์โทรไม่ตรงกับข้อมูลสมาชิก"},401);
        return json(request,{success:true,data:{member_code:m.member_code,prefix:m.prefix,full_name:m.full_name,arabic_name:m.arabic_name,status:"active",phone:m.phone,email:m.email,member_start:m.member_start,member_expire:m.member_expire,address:{address_line:m.address_line,subdistrict:m.subdistrict,district:m.district,province:m.province,postal_code:m.postal_code}}});
      }

      if(/^\/api\/members\//.test(path)&&request.method==="GET"){
        const code=decodeURIComponent(path.split('/').pop()).toUpperCase();
        const rows=await sql`SELECT m.member_code,m.prefix,m.full_name,m.arabic_name,m.status,m.email,m.phone,m.line_user_id,m.registered_at,m.member_start,m.member_expire,a.address_line,a.subdistrict,a.district,a.province,a.postal_code FROM members m LEFT JOIN addresses a ON a.member_code=m.member_code WHERE m.member_code=${code} LIMIT 1`;
        if(!rows.length)return json(request,{success:true,found:false,message:"ไม่พบข้อมูลสมาชิก"},404);const m=rows[0];
        return json(request,{success:true,found:true,data:{...m,status:memberStatusText(m.status),address:{address_line:m.address_line,subdistrict:m.subdistrict,district:m.district,province:m.province,postal_code:m.postal_code}}});
      }

      if(path==="/api/payments"&&request.method==="POST"){
        const b=await body(request);const code=clean(b.member_code).toUpperCase(),amount=Number(b.amount||0);if(!code||amount<=0)return json(request,{success:false,message:"ข้อมูลการชำระไม่ครบ"},400);
        const m=await sql`SELECT member_code FROM members WHERE member_code=${code}`;if(!m.length)return json(request,{success:false,message:"ไม่พบรหัสสมาชิก"},404);
        const paymentId=id('PAY');
        await sql`INSERT INTO payments(payment_id,member_code,topic_id,payment_type,amount,paid_at,slip_url,status,created_at,updated_at) VALUES(${paymentId},${code},${clean(b.topic_id)||null},${clean(b.topic_id)||'ชำระค่าสมาชิก'},${amount},${b.paid_at||new Date().toISOString()},${clean(b.slip_url)||null},'รอตรวจสอบการชำระ',NOW(),NOW())`;
        return json(request,{success:true,payment_id:paymentId},201);
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
      if(path==="/api/benefits"&&request.method==="GET"){
        const rows=await sql`SELECT benefit_id,title,description,start_date,end_date FROM benefits WHERE active=TRUE AND (start_date IS NULL OR start_date<=CURRENT_DATE) AND (end_date IS NULL OR end_date>=CURRENT_DATE) ORDER BY created_at DESC`;
        return json(request,{success:true,data:rows});
      }

      if(path==="/api/admin/members"&&request.method==="GET"){
        const denied=requireAdmin(request,env);if(denied)return denied;
        const rows=await sql`SELECT m.member_code,m.prefix,m.full_name,m.arabic_name,m.email,m.phone,m.line_user_id,m.status,m.registered_at,m.member_start,m.member_expire,a.address_line,a.subdistrict,a.district,a.province,a.postal_code FROM members m LEFT JOIN addresses a ON a.member_code=m.member_code ORDER BY m.registered_at DESC`;
        return json(request,{success:true,data:rows.map(x=>({...x,status:memberStatusText(x.status)}))});
      }
      if(/^\/api\/admin\/members\/[^/]+$/.test(path)){
        const denied=requireAdmin(request,env);if(denied)return denied;const code=decodeURIComponent(path.split('/').pop()).toUpperCase();
        if(request.method==="GET"){
          const rows=await sql`SELECT m.*,a.address_line,a.subdistrict,a.district,a.province,a.postal_code FROM members m LEFT JOIN addresses a ON a.member_code=m.member_code WHERE m.member_code=${code} LIMIT 1`;if(!rows.length)return json(request,{success:false,message:"ไม่พบสมาชิก"},404);return json(request,{success:true,data:{...rows[0],status:memberStatusText(rows[0].status)}});
        }
        if(request.method==="PUT"||request.method==="PATCH"){
          const b=await body(request);const full=[clean(b.first_name),clean(b.last_name)].filter(Boolean).join(' ')||clean(b.full_name);
          await sql.begin(async tx=>{await tx`UPDATE members SET prefix=COALESCE(NULLIF(${clean(b.prefix)},''),prefix),full_name=COALESCE(NULLIF(${full},''),full_name),arabic_name=${clean(b.arabic_name)||null},phone=COALESCE(NULLIF(${clean(b.phone)},''),phone),email=${clean(b.email)||null},line_user_id=${clean(b.line_id)||null},status=COALESCE(NULLIF(${clean(b.status)},''),status),updated_at=NOW() WHERE member_code=${code}`;await tx`INSERT INTO addresses(member_code,address_line,subdistrict,district,province,postal_code,updated_at) VALUES(${code},${clean(b.address_line)||null},${clean(b.subdistrict)||null},${clean(b.district)||null},${clean(b.province)||null},${clean(b.postal_code)||null},NOW()) ON CONFLICT(member_code) DO UPDATE SET address_line=EXCLUDED.address_line,subdistrict=EXCLUDED.subdistrict,district=EXCLUDED.district,province=EXCLUDED.province,postal_code=EXCLUDED.postal_code,updated_at=NOW()`});
          return json(request,{success:true,message:"บันทึกแล้ว"});
        }
      }
      if(/^\/api\/admin\/members\/[^/]+\/status$/.test(path)&&request.method==="PATCH"){
        const denied=requireAdmin(request,env);if(denied)return denied;const code=decodeURIComponent(path.split('/')[4]).toUpperCase(),b=await body(request),st=memberStatusText(b.status);await sql`UPDATE members SET status=${st},member_start=CASE WHEN ${st}='active' AND member_start IS NULL THEN NOW() ELSE member_start END,member_expire=CASE WHEN ${st}='active' AND member_expire IS NULL THEN NOW()+INTERVAL '1 year' ELSE member_expire END,updated_at=NOW() WHERE member_code=${code}`;return json(request,{success:true,status:st});
      }

      if(path==="/api/admin/payments"&&request.method==="GET"){const denied=requireAdmin(request,env);if(denied)return denied;const rows=await sql`SELECT * FROM payments ORDER BY created_at DESC LIMIT 500`;return json(request,{success:true,data:rows})}
      if(path==="/api/admin/donations"&&request.method==="GET"){const denied=requireAdmin(request,env);if(denied)return denied;const rows=await sql`SELECT * FROM donations ORDER BY created_at DESC LIMIT 500`;return json(request,{success:true,data:rows})}
      if(path==="/api/admin/news"&&request.method==="POST"){const denied=requireAdmin(request,env);if(denied)return denied;const b=await body(request),nid=id('NEWS');if(!clean(b.title)||!clean(b.content))return json(request,{success:false,message:"กรุณากรอกหัวข้อและเนื้อหา"},400);await sql`INSERT INTO news(news_id,category,title,content,publish_date,active,created_at,updated_at) VALUES(${nid},${clean(b.category)||'ข่าวสาร'},${clean(b.title)},${clean(b.content)},NOW(),TRUE,NOW(),NOW())`;return json(request,{success:true,news_id:nid},201)}
      if(path==="/api/admin/benefits"&&request.method==="POST"){const denied=requireAdmin(request,env);if(denied)return denied;const b=await body(request),bid=id('BEN');if(!clean(b.title))return json(request,{success:false,message:"กรุณากรอกชื่อสิทธิประโยชน์"},400);await sql`INSERT INTO benefits(benefit_id,title,description,start_date,end_date,active,created_at,updated_at) VALUES(${bid},${clean(b.title)},${clean(b.description)||null},${b.start_date||null},${b.end_date||null},TRUE,NOW(),NOW())`;return json(request,{success:true,benefit_id:bid},201)}
      if(path==="/api/admin/settings"&&request.method==="PUT"){const denied=requireAdmin(request,env);if(denied)return denied;const b=await body(request);for(const [k,v] of Object.entries(b)){if(!['APP_NAME','MEMBERSHIP_FEE_YEARLY','MEMBERSHIP_FEE_MONTHLY','PROMPTPAY','CONTACT_EMAIL'].includes(k))continue;await sql`INSERT INTO app_settings(setting_key,setting_value,updated_at) VALUES(${k},${clean(v)},NOW()) ON CONFLICT(setting_key) DO UPDATE SET setting_value=EXCLUDED.setting_value,updated_at=NOW()`}return json(request,{success:true,message:"บันทึกการตั้งค่าแล้ว"})}

      return json(request,{success:false,message:"API endpoint not found"},404);
    }catch(error){console.error("SK Alumni API Error",error);return json(request,{success:false,message:"Internal server error",error:String(error?.message||error),code:error?.code||null},500)}finally{await sql.end().catch(()=>{})}
  }
};
