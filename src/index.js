import { Client } from "pg";

function cors(request){
  return {
    "Access-Control-Allow-Origin":"*",
    "Access-Control-Allow-Methods":"GET,POST,PUT,PATCH,DELETE,OPTIONS",
    "Access-Control-Allow-Headers":"Content-Type, Authorization, X-Admin-Key, X-Admin-Id",
    "Access-Control-Max-Age":"86400",
    "Content-Type":"application/json; charset=utf-8",
    "X-Robots-Tag":"noindex, nofollow",
    "Cache-Control":"no-store, no-cache, must-revalidate"
  };
}
function json(request,data,status=200){return new Response(JSON.stringify(data),{status,headers:cors(request)})}
function clean(v){return String(v??"").trim()}
async function sha256Hex(value){
  const data=new TextEncoder().encode(String(value||''));
  const buf=await crypto.subtle.digest('SHA-256',data);
  return Array.from(new Uint8Array(buf)).map(b=>b.toString(16).padStart(2,'0')).join('');
}
async function ensureAdminAccountsSchema(sql){
  await sql`CREATE TABLE IF NOT EXISTS admin_accounts (
    admin_id TEXT PRIMARY KEY,
    full_name TEXT NOT NULL,
    key_hash TEXT NOT NULL,
    role TEXT NOT NULL DEFAULT 'admin',
    active BOOLEAN NOT NULL DEFAULT TRUE,
    contact_phone TEXT,
    phone_enabled BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    last_login_at TIMESTAMPTZ
  )`;
  await sql`ALTER TABLE admin_accounts DROP CONSTRAINT IF EXISTS admin_accounts_key_hash_key`;
  await sql`DROP INDEX IF EXISTS admin_accounts_key_hash_key`;
  await sql`CREATE INDEX IF NOT EXISTS idx_admin_accounts_key_hash ON admin_accounts(key_hash)`;
  await sql`ALTER TABLE admin_accounts ADD COLUMN IF NOT EXISTS contact_phone TEXT`;
  await sql`ALTER TABLE admin_accounts ADD COLUMN IF NOT EXISTS phone_enabled BOOLEAN NOT NULL DEFAULT FALSE`;
}
function adminLabel(a){return a?`${clean(a.full_name)||'Admin'} (${clean(a.admin_id)||'ADMIN'})`:'Admin'}
async function resolveAdmin(request,env,sql){
  const bearer=(request.headers.get("Authorization")||"").replace(/^Bearer\s+/i,"").trim();
  const key=clean(request.headers.get("X-Admin-Key")||bearer);
  const requestedId=clean(request.headers.get("X-Admin-Id")).toUpperCase();
  if(!key)return null;
  const keyHash=await sha256Hex(key);
  if(sql){
    try{
      await ensureAdminAccountsSchema(sql);
      const cfg=await sql`SELECT setting_value FROM app_settings WHERE setting_key='ADMIN_API_KEY_HASH' LIMIT 1`;
      const hash=clean(cfg[0]?.setting_value);
      if((!requestedId||requestedId==='ROOT')&&hash&&keyHash===hash)return {admin_id:'ROOT',full_name:'ผู้ดูแลระบบหลัก',role:'owner',active:true};
      const rows=requestedId&&requestedId!=='ROOT'
        ?await sql`SELECT admin_id,full_name,role,active FROM admin_accounts WHERE admin_id=${requestedId} AND key_hash=${keyHash} AND active=TRUE LIMIT 1`
        :await sql`SELECT admin_id,full_name,role,active FROM admin_accounts WHERE key_hash=${keyHash} AND active=TRUE ORDER BY admin_id LIMIT 2`;
      // Without a User ID, accept only an unambiguous legacy login.
      if(rows.length===1){try{await sql`UPDATE admin_accounts SET last_login_at=NOW() WHERE admin_id=${rows[0].admin_id}`}catch(_){};return rows[0]}
    }catch(_){}
  }
  if((!requestedId||requestedId==='ROOT')&&env.ADMIN_API_KEY&&key===env.ADMIN_API_KEY)return {admin_id:'ROOT',full_name:'ผู้ดูแลระบบหลัก',role:'owner',active:true};
  return null;
}
async function currentAdminLabel(request,env,sql){return adminLabel(await resolveAdmin(request,env,sql))}
async function adminOK(request,env,sql){return !!(await resolveAdmin(request,env,sql))}
async function requireAdmin(request,env,sql){return await adminOK(request,env,sql)?null:json(request,{success:false,message:"Unauthorized"},401)}
async function requireOwner(request,env,sql){const a=await resolveAdmin(request,env,sql);return a&&a.role==='owner'?null:json(request,{success:false,message:"Owner permission required"},403)}
function memberStatusText(s){s=String(s||'').toLowerCase().trim();if(['active','ใช้งาน','approved','สมาชิกสมบูรณ์'].includes(s))return'active';if(['review','รอตรวจสอบข้อมูล','รอตรวจสอบการชำระ','pending_review'].includes(s))return'review';if(['payment_pending','pending','รอชำระค่าสนับสนุน','รอชำระค่าสมาชิก','รออนุมัติ'].includes(s))return'payment_pending';if(['cancelled','canceled','rejected','ยกเลิก','ไม่อนุมัติ'].includes(s))return'cancelled';if(['renewal','รอต่ออายุ','รอต่ออายุสมาชิก','ต่ออายุสมาชิก'].includes(s))return'renewal';return'payment_pending'}
function effectiveMemberStatus(m){
  const base=memberStatusText(m?.status);
  if(base==="active" && m?.member_expire){
    const exp=new Date(m.member_expire);
    if(!Number.isNaN(exp.getTime()) && exp.getTime()<=Date.now()) return "renewal";
  }
  return base;
}
function identityMatches(member,identity){
  const raw=clean(identity);
  const email=raw.toLowerCase();
  const digits=raw.replace(/\D/g,"");
  const memberEmail=clean(member?.email).toLowerCase();
  const memberPhone=clean(member?.phone).replace(/\D/g,"");
  if(memberEmail && memberEmail===email) return true;
  if(memberPhone && digits){
    if(memberPhone===digits) return true;
    // รองรับเบอร์ไทยที่ฐานข้อมูลเก็บ +66 / 66 แต่ผู้ใช้กรอก 0xxxxxxxxx และกลับกัน
    const normThai=v=>v.replace(/^\+?66/,'0').replace(/^66/,'0');
    if(normThai(memberPhone)===normThai(digits)) return true;
  }
  return false;
}
async function memberWithAddress(sql,code){
  try{
    const rows=await sql`SELECT m.member_code,m.prefix,m.first_name,m.last_name,m.full_name,m.arabic_name,m.status,m.email,m.phone,m.photo_data,m.member_start,m.member_expire,m.registered_at,a.address_line,a.subdistrict,a.district,a.province,a.postal_code FROM members m LEFT JOIN addresses a ON a.member_code=m.member_code WHERE m.member_code=${code} LIMIT 1`;
    return rows;
  }catch(e){
    console.error("memberWithAddress fallback",e);
    // ระบบรุ่นเก่าบางฐานไม่มี addresses/บางคอลัมน์เสริม ต้องไม่ทำให้ Login ล่ม
    const rows=await sql`SELECT member_code,prefix,first_name,last_name,full_name,arabic_name,status,email,phone,photo_data,member_start,member_expire,registered_at FROM members WHERE member_code=${code} LIMIT 1`;
    return rows.map(r=>({...r,address_line:null,subdistrict:null,district:null,province:null,postal_code:null}));
  }
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
  if(imgs.length>8)return false;
  let total=0;
  for(const img of imgs){
    const t=String(img||'');
    if(!/^data:image\/(jpeg|jpg|png|webp);base64,/i.test(t))return false;
    // Client compresses automatically. Limit each stored image and the complete gallery separately.
    // Older news items may have been saved before the client-side compressor
    // was introduced. Keep them editable while new uploads remain compressed.
    // Allow legacy images already stored before client-side compression was added.
    // New uploads are compressed in admin-content.html; this prevents an edit that
    // adds one image from failing just because an older image is larger.
    if(t.length>5000000)return false;
    total+=t.length;
  }
  return total<=20000000;
}
function homeHeroImageOK(v){
  const t=String(v||'');
  return !t||(/^data:image\/(jpeg|jpg|png|webp);base64,/i.test(t)&&t.length<=1400000);
}

async function ensureMediaSchema(sql){
  await sql`CREATE TABLE IF NOT EXISTS media_library (media_id TEXT PRIMARY KEY,file_name TEXT NOT NULL,category TEXT NOT NULL DEFAULT 'ข่าวสาร',mime_type TEXT,image_data TEXT NOT NULL,size_bytes INTEGER NOT NULL DEFAULT 0,created_by TEXT,created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW())`;
  await sql`CREATE INDEX IF NOT EXISTS idx_media_library_created ON media_library(created_at DESC)`;
}
function mediaImageOK(v){
  const t=String(v||'');
  return /^data:image\/(jpeg|jpg|png|webp);base64,/i.test(t) && t.length<=900000;
}

async function ensureBenefitsSchema(sql){
  await sql`ALTER TABLE benefits ADD COLUMN IF NOT EXISTS active BOOLEAN NOT NULL DEFAULT TRUE`;
  await sql`ALTER TABLE benefits ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()`;
  await sql`CREATE TABLE IF NOT EXISTS benefit_usage(usage_id VARCHAR(80) PRIMARY KEY,member_code VARCHAR(20) NOT NULL REFERENCES members(member_code) ON DELETE RESTRICT,benefit_id VARCHAR(80) NOT NULL REFERENCES benefits(benefit_id) ON DELETE RESTRICT,used_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,recorded_by VARCHAR(100) NOT NULL,note TEXT,amount NUMERIC(12,2) NOT NULL DEFAULT 0 CHECK(amount>=0),active BOOLEAN NOT NULL DEFAULT TRUE,created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP)`;
  await sql`ALTER TABLE benefit_usage ADD COLUMN IF NOT EXISTS active BOOLEAN NOT NULL DEFAULT TRUE`;
  await sql`ALTER TABLE benefit_usage ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()`;
  await sql`ALTER TABLE benefit_usage ADD COLUMN IF NOT EXISTS attachment_data TEXT`;
  await sql`ALTER TABLE benefit_usage ADD COLUMN IF NOT EXISTS attachment_name TEXT`;
  await sql`ALTER TABLE benefit_usage ADD COLUMN IF NOT EXISTS attachment_type TEXT`;
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


async function syncBenefitUsageLedger(sql){
  await ensureBenefitsSchema(sql);await ensureAccountingSchema(sql);
  // Backfill historical usages and keep the accounting row synchronized.
  const usages=await sql`SELECT u.usage_id,u.member_code,u.benefit_id,u.used_at,u.amount,u.note,u.active,u.attachment_data,u.attachment_name,u.attachment_type,COALESCE(b.title,u.benefit_id) AS benefit_title FROM benefit_usage u LEFT JOIN benefits b ON b.benefit_id=u.benefit_id`;
  for(const u of usages){
    const led=await sql`SELECT entry_id,status FROM ledger_entries WHERE reference_type='benefit_usage' AND reference_id=${u.usage_id} ORDER BY created_at LIMIT 1`;
    const amount=Math.max(0,Number(u.amount||0));
    if(!u.active||amount<=0){if(led.length)await sql`UPDATE ledger_entries SET status='void',updated_at=NOW() WHERE entry_id=${led[0].entry_id}`;continue}
    if(led.length){
      await sql`UPDATE ledger_entries SET entry_date=${u.used_at},entry_type='รายจ่าย',category='สิทธิประโยชน์สมาชิก',source='benefit_usage',amount=${amount},member_code=${u.member_code},description=${'ค่าใช้สิทธิ์: '+u.benefit_title},note=${u.note||null},attachment_data=${u.attachment_data||null},attachment_name=${u.attachment_name||null},attachment_type=${u.attachment_type||null},status='posted',updated_at=NOW() WHERE entry_id=${led[0].entry_id}`;
    }else{
      await sql`INSERT INTO ledger_entries(entry_id,entry_date,entry_type,category,source,amount,reference_type,reference_id,member_code,description,note,created_by,status,created_at,updated_at,attachment_data,attachment_name,attachment_type) VALUES(${id('LED')},${u.used_at},'รายจ่าย','สิทธิประโยชน์สมาชิก','benefit_usage',${amount},'benefit_usage',${u.usage_id},${u.member_code},${'ค่าใช้สิทธิ์: '+u.benefit_title},${u.note||null},'system','posted',NOW(),NOW(),${u.attachment_data||null},${u.attachment_name||null},${u.attachment_type||null})`;
    }
  }
}

async function ensureMemberAdminSchema(sql){
  // Additive self-healing for installations upgraded from older member schemas.
  // This is intentionally non-destructive and prevents Admin Member login from
  // failing just because an optional column has not been created yet.
  await sql`ALTER TABLE members ADD COLUMN IF NOT EXISTS line_id TEXT`;
  await sql`ALTER TABLE members ADD COLUMN IF NOT EXISTS line_user_id TEXT`;
  await sql`ALTER TABLE members ADD COLUMN IF NOT EXISTS photo_data TEXT`;
  await sql`ALTER TABLE members ADD COLUMN IF NOT EXISTS member_start TIMESTAMPTZ`;
  await sql`ALTER TABLE members ADD COLUMN IF NOT EXISTS member_expire TIMESTAMPTZ`;
  await sql`ALTER TABLE members ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()`;
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
  await sql`ALTER TABLE donations ADD COLUMN IF NOT EXISTS phone TEXT`;
  await sql`ALTER TABLE donations ADD COLUMN IF NOT EXISTS email TEXT`;
  await sql`ALTER TABLE donations ADD COLUMN IF NOT EXISTS address_line TEXT`;
  await sql`ALTER TABLE donations ADD COLUMN IF NOT EXISTS subdistrict TEXT`;
  await sql`ALTER TABLE donations ADD COLUMN IF NOT EXISTS district TEXT`;
  await sql`ALTER TABLE donations ADD COLUMN IF NOT EXISTS province TEXT`;
  await sql`ALTER TABLE donations ADD COLUMN IF NOT EXISTS postal_code TEXT`;
  await sql`CREATE TABLE IF NOT EXISTS receipt_print_logs (log_id TEXT PRIMARY KEY,batch_id TEXT,payment_id TEXT,receipt_no TEXT,print_type TEXT NOT NULL DEFAULT 'single',printed_by TEXT,printed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),user_agent TEXT)`;
  await sql`ALTER TABLE receipt_print_logs ADD COLUMN IF NOT EXISTS source_type TEXT NOT NULL DEFAULT 'payment'`;
  await sql`ALTER TABLE receipt_print_logs ADD COLUMN IF NOT EXISTS transaction_id TEXT`;
}



async function ensureLineSchema(sql){
  await sql`CREATE TABLE IF NOT EXISTS line_users (line_user_id TEXT PRIMARY KEY,member_code TEXT,display_name TEXT,picture_url TEXT,status_message TEXT,follow_status TEXT NOT NULL DEFAULT 'active',last_event_type TEXT,last_message_at TIMESTAMPTZ,last_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW())`;
  await sql`CREATE INDEX IF NOT EXISTS idx_line_users_member_code ON line_users(member_code)`;
  await sql`CREATE TABLE IF NOT EXISTS line_event_logs (log_id TEXT PRIMARY KEY,line_user_id TEXT,event_type TEXT,message_type TEXT,message_text TEXT,reply_token_present BOOLEAN NOT NULL DEFAULT FALSE,event_timestamp BIGINT,raw_event JSONB,created_at TIMESTAMPTZ NOT NULL DEFAULT NOW())`;
  await sql`CREATE INDEX IF NOT EXISTS idx_line_event_logs_created ON line_event_logs(created_at DESC)`;
  await sql`CREATE INDEX IF NOT EXISTS idx_line_event_logs_user_created ON line_event_logs(line_user_id,created_at DESC)`;
  await sql`ALTER TABLE line_event_logs ADD COLUMN IF NOT EXISTS webhook_event_id TEXT`;
  await sql`ALTER TABLE line_event_logs ADD COLUMN IF NOT EXISTS line_message_id TEXT`;
  await sql`CREATE UNIQUE INDEX IF NOT EXISTS uq_line_event_logs_webhook ON line_event_logs(webhook_event_id) WHERE webhook_event_id IS NOT NULL`;
  await sql`CREATE UNIQUE INDEX IF NOT EXISTS uq_line_event_logs_message ON line_event_logs(line_message_id,event_type) WHERE line_message_id IS NOT NULL`;
  await sql`CREATE TABLE IF NOT EXISTS line_link_tokens (token_hash TEXT PRIMARY KEY,line_user_id TEXT NOT NULL,expires_at TIMESTAMPTZ NOT NULL,used_at TIMESTAMPTZ,created_at TIMESTAMPTZ NOT NULL DEFAULT NOW())`;
  await sql`CREATE INDEX IF NOT EXISTS idx_line_link_tokens_user ON line_link_tokens(line_user_id,created_at DESC)`;
  await sql`CREATE TABLE IF NOT EXISTS line_admin_messages (message_id TEXT PRIMARY KEY,line_user_id TEXT NOT NULL,member_code TEXT,direction TEXT NOT NULL DEFAULT 'in',message_text TEXT NOT NULL DEFAULT '',status TEXT NOT NULL DEFAULT 'received',admin_by TEXT,created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),read_at TIMESTAMPTZ,message_type TEXT NOT NULL DEFAULT 'text',attachment_data TEXT,attachment_name TEXT,attachment_type TEXT,line_message_id TEXT,attachment_token TEXT)`;
  await sql`ALTER TABLE line_admin_messages ALTER COLUMN message_text SET DEFAULT ''`;
  await sql`ALTER TABLE line_admin_messages ADD COLUMN IF NOT EXISTS message_type TEXT NOT NULL DEFAULT 'text'`;
  await sql`ALTER TABLE line_admin_messages ADD COLUMN IF NOT EXISTS attachment_data TEXT`;
  await sql`ALTER TABLE line_admin_messages ADD COLUMN IF NOT EXISTS attachment_name TEXT`;
  await sql`ALTER TABLE line_admin_messages ADD COLUMN IF NOT EXISTS attachment_type TEXT`;
  await sql`ALTER TABLE line_admin_messages ADD COLUMN IF NOT EXISTS line_message_id TEXT`;
  await sql`ALTER TABLE line_admin_messages ADD COLUMN IF NOT EXISTS attachment_token TEXT`;
  await sql`ALTER TABLE line_admin_messages ADD COLUMN IF NOT EXISTS attachment_preview_data TEXT`;
  await sql`CREATE INDEX IF NOT EXISTS idx_line_admin_messages_created ON line_admin_messages(created_at DESC)`;
  await sql`CREATE INDEX IF NOT EXISTS idx_line_admin_messages_user_created ON line_admin_messages(line_user_id,created_at DESC)`;
  await sql`CREATE UNIQUE INDEX IF NOT EXISTS uq_line_admin_messages_line_message ON line_admin_messages(line_message_id,direction) WHERE line_message_id IS NOT NULL`;
  await sql`CREATE INDEX IF NOT EXISTS idx_line_admin_messages_type_created ON line_admin_messages(message_type,created_at DESC)`;
}
function bytesToBase64(bytes){
  let binary='';
  const a=new Uint8Array(bytes);
  for(let i=0;i<a.length;i++) binary+=String.fromCharCode(a[i]);
  return btoa(binary);
}
async function verifyLineSignature(rawBody,signature,channelSecret){
  if(!rawBody||!signature||!channelSecret) return false;
  const enc=new TextEncoder();
  const key=await crypto.subtle.importKey('raw',enc.encode(channelSecret),{name:'HMAC',hash:'SHA-256'},false,['sign']);
  const mac=await crypto.subtle.sign('HMAC',key,enc.encode(rawBody));
  return safeEqual(bytesToBase64(mac),signature);
}
async function lineReply(env,replyToken,messages){
  if(!replyToken||!env.LINE_CHANNEL_ACCESS_TOKEN) return {ok:false,skipped:true};
  const payload={replyToken,messages:(Array.isArray(messages)?messages:[messages]).slice(0,5)};
  const r=await fetch('https://api.line.me/v2/bot/message/reply',{method:'POST',headers:{'Content-Type':'application/json','Authorization':'Bearer '+env.LINE_CHANNEL_ACCESS_TOKEN},body:JSON.stringify(payload)});
  const text=await r.text();
  if(!r.ok) console.error('LINE reply failed',r.status,text);
  return {ok:r.ok,status:r.status,body:text};
}
async function linePush(env,to,messages){
  const uid=clean(to);
  if(!uid||!env.LINE_CHANNEL_ACCESS_TOKEN) return {ok:false,skipped:true};
  const payload={to:uid,messages:(Array.isArray(messages)?messages:[messages]).slice(0,5)};
  const r=await fetch('https://api.line.me/v2/bot/message/push',{method:'POST',headers:{'Content-Type':'application/json','Authorization':'Bearer '+env.LINE_CHANNEL_ACCESS_TOKEN},body:JSON.stringify(payload)});
  const text=await r.text();
  if(!r.ok) console.error('LINE push failed',r.status,text);
  return {ok:r.ok,status:r.status,body:text};
}

async function refreshLineProfile(sql,env,lineUserId){
  const uid=clean(lineUserId);if(!sql||!uid||!env.LINE_CHANNEL_ACCESS_TOKEN)return null;
  try{
    const r=await fetch('https://api.line.me/v2/bot/profile/'+encodeURIComponent(uid),{headers:{'Authorization':'Bearer '+env.LINE_CHANNEL_ACCESS_TOKEN}});
    if(!r.ok)return null;const pr=await r.json();
    await ensureLineSchema(sql);
    await sql`INSERT INTO line_users(line_user_id,display_name,picture_url,status_message,follow_status,last_seen_at,created_at,updated_at) VALUES(${uid},${clean(pr.displayName)||null},${clean(pr.pictureUrl)||null},${clean(pr.statusMessage)||null},'active',NOW(),NOW(),NOW()) ON CONFLICT(line_user_id) DO UPDATE SET display_name=COALESCE(EXCLUDED.display_name,line_users.display_name),picture_url=COALESCE(EXCLUDED.picture_url,line_users.picture_url),status_message=COALESCE(EXCLUDED.status_message,line_users.status_message),last_seen_at=NOW(),updated_at=NOW()`;
    return pr;
  }catch(err){console.error('LINE profile refresh failed',err);return null}
}

function lineAttachmentOK(data){
  const t=String(data||'');
  if(!/^data:(image\/(jpeg|jpg|png|webp|gif)|application\/pdf|text\/plain|application\/(zip|x-zip-compressed|msword|vnd\.openxmlformats-officedocument\.wordprocessingml\.document|vnd\.ms-excel|vnd\.openxmlformats-officedocument\.spreadsheetml\.sheet));base64,/i.test(t))return false;
  return t.length<=7200000; // about 5 MB binary after base64 expansion
}
function dataUrlParts(data){
  const m=String(data||'').match(/^data:([^;,]+);base64,(.*)$/s);if(!m)return null;
  return {mime:m[1],base64:m[2]};
}
function base64ToBytes(b64){const bin=atob(String(b64||''));const out=new Uint8Array(bin.length);for(let i=0;i<bin.length;i++)out[i]=bin.charCodeAt(i);return out}
function attachmentLabel(type,name){const t=String(type||'').toLowerCase();if(t.startsWith('image/'))return '🖼️ รูปภาพ';return '📎 '+(clean(name)||'ไฟล์แนบ')}
async function fetchLineMessageContent(env,messageId,maxBytes=5*1024*1024){
  const mid=clean(messageId);if(!mid||!env.LINE_CHANNEL_ACCESS_TOKEN)return null;
  const r=await fetch('https://api-data.line.me/v2/bot/message/'+encodeURIComponent(mid)+'/content',{headers:{'Authorization':'Bearer '+env.LINE_CHANNEL_ACCESS_TOKEN}});
  if(!r.ok){console.error('LINE content fetch failed',r.status,await r.text().catch(()=>''));return null}
  const declared=Number(r.headers.get('content-length')||0);if(declared&&declared>maxBytes)return {tooLarge:true,size:declared};
  const ab=await r.arrayBuffer();if(ab.byteLength>maxBytes)return {tooLarge:true,size:ab.byteLength};
  const mime=(r.headers.get('content-type')||'application/octet-stream').split(';')[0].trim();
  return {data:'data:'+mime+';base64,'+bytesToBase64(ab),mime,size:ab.byteLength};
}
function publicLineMediaUrl(request,messageId,token){
  const u=new URL(request.url);return u.origin+'/api/line/media/'+encodeURIComponent(messageId)+'?token='+encodeURIComponent(token);
}
async function notifyLinkedMember(sql,env,memberCode,text){
  try{
    const code=clean(memberCode).toUpperCase(); if(!code||!sql)return {ok:false,skipped:true};
    await ensureLineSchema(sql);
    const rows=await sql`SELECT line_user_id FROM line_users WHERE member_code=${code} AND follow_status='active' AND line_user_id IS NOT NULL ORDER BY updated_at DESC LIMIT 1`;
    if(!rows.length)return {ok:false,skipped:true};
    return await linePush(env,rows[0].line_user_id,{type:'text',text:String(text||'').slice(0,5000)});
  }catch(err){console.error('LINE member notification error (ignored)',err);return {ok:false,error:String(err)}}
}
function lineDateTime(value=new Date()){
  try{return new Intl.DateTimeFormat('th-TH',{timeZone:'Asia/Bangkok',weekday:'long',day:'numeric',month:'long',year:'numeric',hour:'2-digit',minute:'2-digit',second:'2-digit',hour12:false}).format(new Date(value))+' น.'}catch{return String(value||'')}
}
function notifyLinkedMemberBackground(ctx,env,memberCode,text){
  return lineBackground(ctx,(async()=>{const client=db(env);try{return await notifyLinkedMember(client,env,memberCode,text)}finally{await client.end().catch(()=>{})}})());
}

function lineWelcomeText(){
  return 'เชื่อมต่อ LINE กับระบบสมาชิกศิษย์เก่าสำเร็จแล้ว ✅\n\nพิมพ์ “เมนู” เพื่อดูคำสั่งที่ใช้งานได้';
}
function lineMenuText(){
  return 'เมนูระบบสมาชิกศิษย์เก่า\n'
    +'• หน้าหลัก — เปิดหน้าแรกของระบบ\n'
    +'• ลงทะเบียน — เปิดหน้าลงทะเบียน\n'
    +'• ตรวจสอบสถานะ — ตรวจสอบสถานะสมาชิก\n'
    +'• สิทธิประโยชน์ — ดูสิทธิประโยชน์ที่เปิดใช้งาน\n'
    +'• เชื่อมบัญชี — เชื่อม LINE กับรหัสสมาชิก\n'
    +'• ข้อมูลของฉัน — เปิด Member Portal\n'
    +'• แก้ไขข้อมูล — เปิดข้อมูลส่วนตัวเพื่อแก้ไข\n'
    +'• บัตรสมาชิก — เปิดบัตรสมาชิกดิจิทัล\n'
    +'• ประวัติชำระ — ดูประวัติชำระสมาชิก\n'
    +'• ประวัติบริจาค — ดูประวัติการบริจาค\n'
    +'• ประวัติสิทธิ์ — ดูประวัติการใช้สิทธิประโยชน์\n'
    +'• สนับสนุนรายปี — แจ้งชำระค่าบำรุงสมาคม\n'
    +'• บริจาค — สนับสนุนกิจกรรมสมาคม\n'
    +'• โทรหาแอดมิน — โทรจากเบอร์ที่ระบบกำหนด\n'
    +'• ติดต่อแอดมิน — ส่งข้อความหรือไฟล์ถึงผู้ดูแลระบบ\n\n'
    +'พิมพ์ชื่อเมนูที่ต้องการได้เลยค่ะ';
}
function lineFlexButton(label,action,style='primary',color='#17966A'){
  return {type:'button',style,color,height:'sm',action:{label,...action}};
}
function lineLinkFlex(title,body,url,buttonLabel){
  return {type:'flex',altText:title,contents:{type:'bubble',styles:{header:{backgroundColor:'#DDF4E8'},footer:{backgroundColor:'#F7FCF9'}},header:{type:'box',layout:'vertical',contents:[{type:'text',text:'🌿 '+title,weight:'bold',size:'lg',color:'#075E43',wrap:true}]},body:{type:'box',layout:'vertical',contents:[{type:'text',text:body,size:'sm',color:'#49645A',wrap:true}]},footer:{type:'box',layout:'vertical',contents:[lineFlexButton(buttonLabel,{type:'uri',uri:url})]}}};
}
function lineWaitingContactFlex(){
  // Deliberately use the same minimal Bubble structure as the proven call card.
  return {type:'flex',altText:'รอการติดต่อจากแอดมิน',contents:{type:'bubble',styles:{header:{backgroundColor:'#FFF4D8'},body:{backgroundColor:'#FFFCF4'}},header:{type:'box',layout:'vertical',contents:[{type:'text',text:'⏳ รอการติดต่อจากแอดมิน',weight:'bold',size:'lg',color:'#8A6500',wrap:true}]},body:{type:'box',layout:'vertical',spacing:'sm',contents:[{type:'text',text:'🌙 แอดมินได้รับข้อความของคุณแล้ว',size:'sm',color:'#76633B',wrap:true},{type:'text',text:'กรุณารอให้แอดมินส่งคำขอการโทรให้ และคุณจะโทรผ่าน LINE นี้ได้ครับ',size:'sm',color:'#6B6250',wrap:true}]}}};
}
function lineWelcomeFlex(){
  return {type:'flex',altText:'ศิษย์เก่าคือครอบครัว',contents:{type:'bubble',styles:{header:{backgroundColor:'#CFEFDD'},body:{backgroundColor:'#F7FCF9'},footer:{backgroundColor:'#F7FCF9'}},header:{type:'box',layout:'vertical',alignItems:'center',contents:[{type:'text',text:'🌿 ศิษย์เก่าคือครอบครัว',weight:'bold',size:'xl',color:'#075E43',wrap:true,align:'center'}]},body:{type:'box',layout:'vertical',spacing:'md',contents:[{type:'text',text:'ลงทะเบียนศิษย์เก่า หรือ เชื่อม Line กับรหัสสมาชิกเดิมได้เลยครับ',size:'sm',color:'#49645A',wrap:true,align:'center'}]},footer:{type:'box',layout:'vertical',spacing:'sm',contents:[lineFlexButton('ลงทะเบียนศิษย์เก่า',{type:'uri',uri:lineWebBase()+'register.html?v=2.7.07'}),lineFlexButton('เชื่อมบัญชีสมาชิก',{type:'message',text:'เชื่อมบัญชี'},'secondary','#17966A'),lineFlexButton('ดูเมนูหลัก',{type:'message',text:'เมนู'},'link','#17966A')]}}};
}
function lineMainMenuFlex(){
  const item=(icon,title,text,color)=>({type:'box',layout:'horizontal',spacing:'md',paddingAll:'14px',cornerRadius:'12px',backgroundColor:color,action:{type:'message',label:title,text},contents:[{type:'text',text:icon,size:'xl',flex:0},{type:'text',text:title,weight:'bold',color:'#075E43',gravity:'center',wrap:true}]});
  return {type:'flex',altText:'เมนูสมาชิก 6 รายการ',contents:{type:'bubble',styles:{header:{backgroundColor:'#CFEFDD'},body:{backgroundColor:'#F7FCF9'}},header:{type:'box',layout:'vertical',contents:[{type:'text',text:'🌿 เมนูสมาชิก',weight:'bold',size:'xl',color:'#075E43'}]},body:{type:'box',layout:'vertical',spacing:'sm',contents:[item('🔗','เชื่อมบัญชี','เชื่อมบัญชี','#EEF8DF'),item('🏠','หน้าหลักระบบ','หน้าหลัก','#E6F7EE'),item('🔎','ตรวจสอบสถานะ','ตรวจสอบสถานะ','#FFF4D8'),item('🪪','ข้อมูลของฉัน','ข้อมูลของฉัน','#EAF4FF'),item('🤲🏻','บริจาค','บริจาค','#F9ECF4'),item('📞','ติดต่อแอดมิน','ติดต่อแอดมิน','#E3F7F5')]}}};
}
function lineHistoryMenuFlex(){
  return {type:'flex',altText:'เลือกประวัติของฉัน',contents:{type:'bubble',styles:{header:{backgroundColor:'#EAF4FF'},body:{backgroundColor:'#F8FBFF'}},header:{type:'box',layout:'vertical',contents:[{type:'text',text:'🧾 ประวัติของฉัน',weight:'bold',size:'lg',color:'#075E43'}]},body:{type:'box',layout:'vertical',spacing:'sm',contents:[lineFlexButton('ประวัติชำระค่าสมาชิก',{type:'message',text:'ประวัติชำระ'}),lineFlexButton('ประวัติการบริจาค',{type:'message',text:'ประวัติบริจาค'},'secondary','#17966A'),lineFlexButton('ประวัติการใช้สิทธิ์',{type:'message',text:'ประวัติสิทธิ์'},'secondary','#17966A')]}}};
}
function lineWebBase(){return 'https://itpcmc2024.github.io/sk-alumni-api/'}
function normalizeLineCommand(value){
  return clean(value).toLowerCase().replace(/[“”"'`]/g,'').replace(/[.!?！？。]/g,'').replace(/\s+/g,' ').trim();
}
async function saveLineEventNonCritical(event,sql,env){
  if(!sql)return;
  try{
    const userId=clean(event?.source?.userId),eventType=clean(event?.type),msgType=clean(event?.message?.type);
    const msgText=msgType==='text'?clean(event?.message?.text):(msgType==='image'?'[รูปภาพ]':msgType==='file'?'[ไฟล์] '+clean(event?.message?.fileName):msgType?'['+msgType+']':'');
    await ensureLineSchema(sql);
    if(userId){
      await sql`INSERT INTO line_users(line_user_id,follow_status,last_event_type,last_message_at,last_seen_at,created_at,updated_at) VALUES(${userId},${eventType==='unfollow'?'inactive':'active'},${eventType||null},${eventType==='message'?new Date(Number(event.timestamp)||Date.now()).toISOString():null},NOW(),NOW(),NOW()) ON CONFLICT(line_user_id) DO UPDATE SET follow_status=EXCLUDED.follow_status,last_event_type=EXCLUDED.last_event_type,last_message_at=COALESCE(EXCLUDED.last_message_at,line_users.last_message_at),last_seen_at=NOW(),updated_at=NOW()`;
    }
    const webhookId=clean(event?.webhookEventId)||null,lineMessageId=clean(event?.message?.id)||null,logId=webhookId?('LINE-'+webhookId):id('LINE');
    await sql`INSERT INTO line_event_logs(log_id,line_user_id,event_type,message_type,message_text,reply_token_present,event_timestamp,raw_event,created_at,webhook_event_id,line_message_id) VALUES(${logId},${userId||null},${eventType||null},${msgType||null},${msgText||null},${!!event?.replyToken},${Number(event?.timestamp||0)||null},CAST(${JSON.stringify(event||{})} AS JSONB),NOW(),${webhookId},${lineMessageId}) ON CONFLICT DO NOTHING`;
    if(userId&&eventType!=='unfollow') await refreshLineProfile(sql,env,userId);
  }catch(err){
    console.error('LINE log error (ignored)',err);
  }
}

function lineMemberName(m){
  const prefix=clean(m?.prefix),first=clean(m?.first_name),last=clean(m?.last_name),full=clean(m?.full_name);
  if(full) return prefix && !full.startsWith(prefix) ? `${prefix} ${full}`.trim() : full;
  return [prefix,first,last].filter(Boolean).join(' ').trim() || clean(m?.member_code) || 'สมาชิก';
}
async function linkedLineMember(sql,lineUserId){
  const uid=clean(lineUserId);
  if(!sql||!uid) return null;
  await ensureLineSchema(sql);
  const rows=await sql`SELECT m.member_code,m.prefix,m.first_name,m.last_name,m.full_name,m.status,m.member_start,m.member_expire,m.email,m.phone,lu.line_user_id,lu.follow_status FROM line_users lu JOIN members m ON m.member_code=lu.member_code WHERE lu.line_user_id=${uid} AND lu.member_code IS NOT NULL LIMIT 1`;
  if(!rows.length) return null;
  const m=rows[0];
  if(clean(m.follow_status).toLowerCase()==='inactive') return null;
  return {...m,status:effectiveMemberStatus(m)};
}
function lineRandomToken(){
  const a=new Uint8Array(32);crypto.getRandomValues(a);
  return Array.from(a,b=>b.toString(16).padStart(2,'0')).join('');
}
async function lineLinkSignature(payload,env){
  const secret=clean(env?.LINE_CHANNEL_SECRET)||clean(env?.ADMIN_API_KEY)||'sk-alumni-line-link';
  const enc=new TextEncoder();
  const key=await crypto.subtle.importKey('raw',enc.encode(secret),{name:'HMAC',hash:'SHA-256'},false,['sign']);
  const raw=await crypto.subtle.sign('HMAC',key,enc.encode(payload));
  return Array.from(new Uint8Array(raw)).map(b=>b.toString(16).padStart(2,'0')).join('');
}
async function createFastLineLinkToken(lineUserId,env){
  const uid=clean(lineUserId);
  if(!uid) throw new Error('LINE User ID is required');
  const exp=Math.floor(Date.now()/1000)+(15*60);
  const nonce=lineRandomToken().slice(0,24);
  const payload=uid+'.'+exp+'.'+nonce;
  const sig=await lineLinkSignature(payload,env);
  return encodeURIComponent(payload)+'.'+sig;
}
async function verifyFastLineLinkToken(token,env){
  const raw=String(token||'');
  const dot=raw.lastIndexOf('.');
  if(dot<=0)return null;
  const encodedPayload=raw.slice(0,dot),sig=raw.slice(dot+1);
  let payload='';try{payload=decodeURIComponent(encodedPayload)}catch{return null}
  const parts=payload.split('.');
  if(parts.length<3)return null;
  const uid=clean(parts[0]),exp=Number(parts[1]);
  if(!uid||!exp||exp<Math.floor(Date.now()/1000))return null;
  const expected=await lineLinkSignature(payload,env);
  if(!safeEqual(expected,sig))return null;
  return {line_user_id:uid,expires_at:new Date(exp*1000).toISOString()};
}

// V2.6.82: stateless token for the "ข้อมูลของฉัน" command.
// It lets LINE reply immediately; PostgreSQL lookup happens only after the member opens the link.
async function createFastLinePortalToken(lineUserId,env){
  const uid=clean(lineUserId);
  if(!uid) throw new Error('LINE User ID is required');
  const exp=Math.floor(Date.now()/1000)+(10*60);
  const nonce=lineRandomToken().slice(0,24);
  const payload='portal.'+uid+'.'+exp+'.'+nonce;
  const sig=await lineLinkSignature(payload,env);
  return encodeURIComponent(payload)+'.'+sig;
}
async function verifyFastLinePortalToken(token,env){
  const raw=String(token||'');
  const dot=raw.lastIndexOf('.');
  if(dot<=0)return null;
  const encodedPayload=raw.slice(0,dot),sig=raw.slice(dot+1);
  let payload='';try{payload=decodeURIComponent(encodedPayload)}catch{return null}
  const parts=payload.split('.');
  if(parts.length<4||parts[0]!=='portal')return null;
  const uid=clean(parts[1]),exp=Number(parts[2]);
  if(!uid||!exp||exp<Math.floor(Date.now()/1000))return null;
  const expected=await lineLinkSignature(payload,env);
  if(!safeEqual(expected,sig))return null;
  return {line_user_id:uid,expires_at:new Date(exp*1000).toISOString()};
}

function linePortalUrl(token,extra={}){
  const q=new URLSearchParams({line_token:token,from:'line',v:'2.7.07'});
  Object.entries(extra||{}).forEach(([k,v])=>{if(v!==undefined&&v!==null&&String(v)!=='')q.set(k,String(v))});
  return lineWebBase()+'member.html?'+q.toString();
}
async function replyLinePortalShortcut(event,env,userId,label,extra={}){
  if(!userId){
    await lineReply(env,event.replyToken,{type:'text',text:'ไม่พบ LINE User ID กรุณาลองใหม่จากห้องแชทของบัญชีทางการ'});
    return;
  }
  try{
    const token=await createFastLinePortalToken(userId,env);
    await lineReply(env,event.replyToken,lineLinkFlex(label,'ลิงก์ส่วนตัวนี้มีอายุ 10 นาที',linePortalUrl(token,extra),'เปิดหน้าสมาชิก'));
  }catch(err){
    console.error('LINE member shortcut token error',err);
    await lineReply(env,event.replyToken,{type:'text',text:'ยังไม่สามารถสร้างลิงก์สมาชิกได้ กรุณาลองใหม่อีกครั้ง หรือติดต่อ Admin'});
  }
}
async function createLineLinkToken(sql,lineUserId){
  const uid=clean(lineUserId);
  if(!sql||!uid) throw new Error('LINE User ID is required');
  await ensureLineSchema(sql);
  // The account-link command replies before the non-critical event logger runs,
  // therefore the LINE user row must exist here as well.
  await sql`INSERT INTO line_users(line_user_id,follow_status,last_seen_at,created_at,updated_at) VALUES(${uid},'active',NOW(),NOW(),NOW()) ON CONFLICT(line_user_id) DO UPDATE SET follow_status='active',last_seen_at=NOW(),updated_at=NOW()`;
  await sql`UPDATE line_link_tokens SET used_at=COALESCE(used_at,NOW()) WHERE line_user_id=${uid} AND used_at IS NULL`;
  const token=lineRandomToken(),hash=await sha256Hex(token),expires=new Date(Date.now()+15*60*1000).toISOString();
  await sql`INSERT INTO line_link_tokens(token_hash,line_user_id,expires_at,created_at) VALUES(${hash},${uid},${expires},NOW())`;
  return token;
}

async function saveLineAdminMessageNonCritical(sql,lineUserId,text,direction='in',adminBy=null,meta={}){
  const uid=clean(lineUserId),msg=String(text||'').trim();
  if(!sql||!uid||(!msg&&!meta?.attachment_data))return false;
  const lineMessageId0=clean(meta?.line_message_id)||null;
  const messageId=clean(meta?.message_id)||(direction==='in'&&lineMessageId0?('LCM-IN-'+lineMessageId0):id('LCM'));
  const messageType=clean(meta?.message_type)||((meta?.attachment_type||'').startsWith('image/')?'image':(meta?.attachment_data?'file':'text'));
  const att=clean(meta?.attachment_data)||null,attName=clean(meta?.attachment_name)||null,attType=clean(meta?.attachment_type)||null,lineMessageId=lineMessageId0,attToken=clean(meta?.attachment_token)||lineRandomToken();
  const write=async()=>{
    const linked=await sql`SELECT member_code FROM line_users WHERE line_user_id=${uid} LIMIT 1`;
    await sql`INSERT INTO line_admin_messages(message_id,line_user_id,member_code,direction,message_text,status,admin_by,created_at,message_type,attachment_data,attachment_name,attachment_type,line_message_id,attachment_token)
      VALUES(${messageId},${uid},${linked[0]?.member_code||null},${direction},${msg},${direction==='in'?'received':'sent'},${adminBy||null},NOW(),${messageType},${att},${attName},${attType},${lineMessageId},${attToken})
      ON CONFLICT DO NOTHING`;
    return {ok:true,message_id:messageId,attachment_token:attToken};
  };
  try{return await write()}catch(err){
    console.error('LINE admin message direct save failed; retrying schema init',err);
    try{await ensureLineSchema(sql);return await write()}catch(err2){console.error('LINE admin message save error (ignored)',err2);return false}
  }
}

async function recoverLineAdminMessages(sql){
  // V2.7.07: recover member-to-Admin text from the general LINE event log.
  // Earlier versions only recovered messages beginning with "แอดมิน".  Since ordinary
  // free-form text is now a valid Admin conversation, old free-form test messages are
  // recoverable too, while known system commands are excluded.
  await ensureLineSchema(sql);
  await sql`INSERT INTO line_admin_messages(message_id,line_user_id,member_code,direction,message_text,status,created_at)
    SELECT 'LCM-REC-'||lel.log_id,lel.line_user_id,lu.member_code,'in',
           CASE WHEN lel.message_text ~* '^(แอดมิน|admin)\s+'
                THEN REGEXP_REPLACE(lel.message_text,'^(แอดมิน|admin)\s+','','i')
                ELSE lel.message_text END,
           'received',lel.created_at
    FROM line_event_logs lel
    LEFT JOIN line_users lu ON lu.line_user_id=lel.line_user_id
    WHERE lel.event_type='message' AND lel.message_type='text' AND lel.line_user_id IS NOT NULL
      AND COALESCE(NULLIF(TRIM(lel.message_text),''),'')<>''
      AND LOWER(TRIM(lel.message_text)) NOT IN (
        'เมนู','menu','help','ช่วยเหลือ','คำสั่ง','ลงทะเบียน','ตรวจสอบสถานะ','สมาชิก','สถานะสมาชิก','ตรวจสอบสมาชิก',
        'หน้าหลัก','สนับสนุนรายปี','บริจาค','โทรหาแอดมิน','สิทธิประโยชน์','สิทธิ','ติดต่อแอดมิน','ติดต่อ admin','contact admin','เชื่อมบัญชี','ผูกบัญชี','เชื่อมสมาชิก',
        'ข้อมูลของฉัน','ข้อมูลสมาชิก','บัญชีสมาชิก','แก้ไขข้อมูล','แก้ไขข้อมูลส่วนตัว','ข้อมูลส่วนตัว','บัตรสมาชิก','บัตรสมาชิกดิจิทัล','บัตรของฉัน',
        'ประวัติของฉัน','ประวัติ','ประวัติชำระ','ประวัติชำระสมาชิก','ประวัติการชำระ','ชำระสมาชิก','ประวัติบริจาค','ประวัติการบริจาค','บริจาคของฉัน',
        'ประวัติสิทธิ์','ประวัติสิทธิประโยชน์','ประวัติการใช้สิทธิ','สิทธิ์ของฉัน'
      )
      AND NOT EXISTS(
        SELECT 1 FROM line_admin_messages lam
        WHERE lam.line_user_id=lel.line_user_id
          AND lam.direction='in'
          AND lam.created_at BETWEEN lel.created_at-INTERVAL '30 seconds' AND lel.created_at+INTERVAL '30 seconds'
          AND lam.message_text=(CASE WHEN lel.message_text ~* '^(แอดมิน|admin)\s+' THEN REGEXP_REPLACE(lel.message_text,'^(แอดมิน|admin)\s+','','i') ELSE lel.message_text END)
      )
    ON CONFLICT DO NOTHING`;
}
function lineBackground(ctx,promise){
  const task=Promise.resolve(promise).catch(err=>console.error('LINE background task failed',err));
  if(ctx&&typeof ctx.waitUntil==='function'){
    // Keep a reference so the webhook can close PostgreSQL only after all LINE jobs finish.
    // V2.7.07 closed the shared PG client in fetch.finally() while waitUntil() jobs were still writing,
    // so LINE replied successfully but the Admin inbox stayed empty.
    if(!Array.isArray(ctx.__skLineTasks)) ctx.__skLineTasks=[];
    ctx.__skLineTasks.push(task);
    ctx.waitUntil(task);
    return task;
  }
  return task;
}

async function handleLineEvent(event,env,sql,ctx){
  const userId=clean(event?.source?.userId);
  const eventType=clean(event?.type);
  const msgType=clean(event?.message?.type);
  const msgText=msgType==='text'?clean(event?.message?.text):(msgType==='image'?'[รูปภาพ]':msgType==='file'?'[ไฟล์] '+clean(event?.message?.fileName):msgType==='sticker'?'[สติ๊กเกอร์ LINE]':msgType?'['+msgType+']':'');

  // IMPORTANT V2.6.80:
  // Reply to follow/basic commands FIRST. No DB query/schema creation may delay replyToken.
  if(eventType==='follow'&&event.replyToken){
    await lineReply(env,event.replyToken,lineWelcomeFlex());
    lineBackground(ctx,saveLineEventNonCritical(event,sql,env));
    return;
  }

  // V2.7.07: LINE doesn't expose sticker image bytes, but webhook sticker metadata
  // must still become a visible Admin Inbox message.
  if(eventType==='message'&&msgType==='sticker'){
    const packageId=clean(event?.message?.packageId),stickerId=clean(event?.message?.stickerId);
    const stickerText=clean(event?.message?.text);
    const stickerLabel=stickerText?('🎟️ สติ๊กเกอร์ LINE · '+stickerText):'🎟️ สติ๊กเกอร์ LINE';
    lineBackground(ctx,(async()=>{
      await saveLineEventNonCritical(event,sql,env);
      await saveLineAdminMessageNonCritical(sql,userId,stickerLabel,'in',null,{
        message_type:'sticker',
        attachment_name:[packageId,stickerId].filter(Boolean).join(':')||null,
        attachment_type:clean(event?.message?.stickerResourceType)||null,
        line_message_id:event?.message?.id
      });
    })());
    return;
  }

  // V2.7.07: media messages enter the Admin Inbox quietly, like a natural LINE OA chat.
  // LINE already shows the user's sent media, so avoid repetitive acknowledgement bubbles.
  if(eventType==='message'&&(msgType==='image'||msgType==='file')){
    lineBackground(ctx,(async()=>{
      await saveLineEventNonCritical(event,sql,env);
      const content=await fetchLineMessageContent(env,event?.message?.id);
      const fileName=msgType==='file'?(clean(event?.message?.fileName)||'LINE-file'):'LINE-image.jpg';
      if(content?.tooLarge){
        await saveLineAdminMessageNonCritical(sql,userId,'[ไฟล์มีขนาดใหญ่เกิน 5 MB จึงไม่สามารถเก็บสำเนาในระบบได้]','in',null,{message_type:msgType,attachment_name:fileName,line_message_id:event?.message?.id});
      }else if(content?.data){
        await saveLineAdminMessageNonCritical(sql,userId,msgType==='image'?'[รูปภาพ]':'[ไฟล์] '+fileName,'in',null,{message_type:msgType,attachment_data:content.data,attachment_name:fileName,attachment_type:content.mime,line_message_id:event?.message?.id});
      }else{
        await saveLineAdminMessageNonCritical(sql,userId,msgType==='image'?'[ไม่สามารถดาวน์โหลดรูปภาพจาก LINE ได้]':'[ไม่สามารถดาวน์โหลดไฟล์จาก LINE ได้]','in',null,{message_type:msgType,attachment_name:fileName,line_message_id:event?.message?.id});
      }
    })());
    return;
  }

  if(eventType!=='message'||msgType!=='text'||!event.replyToken){
    lineBackground(ctx,saveLineEventNonCritical(event,sql,env));
    return;
  }

  const t=normalizeLineCommand(msgText);

  if(['เมนู','menu','help','ช่วยเหลือ','คำสั่ง'].includes(t)){
    await lineReply(env,event.replyToken,lineMainMenuFlex());
    lineBackground(ctx,saveLineEventNonCritical(event,sql,env));
    return;
  }
  if(t==='หน้าหลัก'){
    await lineReply(env,event.replyToken,lineLinkFlex('หน้าหลัก','เปิดหน้าแรกระบบสมาชิกสมาคมศิษย์เก่า',lineWebBase()+'index.html?v=2.7.07','เปิดหน้าหลัก'));
    lineBackground(ctx,saveLineEventNonCritical(event,sql,env));return;
  }
  if(t==='สนับสนุนรายปี'){
    await lineReply(env,event.replyToken,lineLinkFlex('สนับสนุนรายปี','แจ้งชำระค่าบำรุงสมาคมศิษย์เก่าฯ รายปี',lineWebBase()+'payment.html?v=2.7.07','เปิดหน้าแจ้งชำระ'));
    lineBackground(ctx,saveLineEventNonCritical(event,sql,env));return;
  }
  if(t==='บริจาค'){
    await lineReply(env,event.replyToken,lineLinkFlex('บริจาค','ร่วมสนับสนุนกิจกรรมและโครงการของสมาคม',lineWebBase()+'donation.html?v=2.7.07','เปิดหน้าบริจาค'));
    lineBackground(ctx,saveLineEventNonCritical(event,sql,env));return;
  }
  if(t==='โทรหาแอดมิน'||t==='ติดต่อแอดมิน'){
    let contacts=[];try{await ensureAdminAccountsSchema(sql);const admins=await sql`SELECT admin_id,full_name,contact_phone FROM admin_accounts WHERE active=TRUE AND phone_enabled=TRUE AND contact_phone IS NOT NULL AND contact_phone<>'' ORDER BY admin_id`;contacts=admins.map(x=>({label:clean(x.admin_id)||clean(x.full_name)||'ADMIN',phone:clean(x.contact_phone).replace(/[^\d+]/g,'')})).filter(x=>x.phone)}catch{}
    if(!contacts.length)try{const rows=await sql`SELECT setting_key,setting_value FROM app_settings WHERE setting_key IN ('CONTACT_PHONE','CONTACT_PHONE_ENABLED')`;const phone=clean(rows.find(x=>x.setting_key==='CONTACT_PHONE')?.setting_value).replace(/[^\d+]/g,''),enabled=clean(rows.find(x=>x.setting_key==='CONTACT_PHONE_ENABLED')?.setting_value)!=='false';if(enabled&&phone)contacts=[{label:'ADMIN',phone}]}catch{}
    const masked=p=>p.length>=7?p.slice(0,3)+'-'+p.slice(3,6)+'xxxx':p;
    const body=contacts.flatMap((x,i)=>[{type:'text',text:'📱 เบอร์ติดต่อ '+masked(x.phone)+' ('+x.label+')',size:'sm',color:'#49645A',wrap:true},lineFlexButton('โทรเลย',{type:'uri',uri:'tel:'+x.phone}),...(i<contacts.length-1?[{type:'separator',margin:'md'}]:[])]);
    const msg=contacts.length?{type:'flex',altText:'ติดต่อแอดมิน',contents:{type:'bubble',styles:{header:{backgroundColor:'#CFEFDD'},body:{backgroundColor:'#F7FCF9'}},header:{type:'box',layout:'vertical',contents:[{type:'text',text:'📞 ติดต่อแอดมิน',weight:'bold',size:'lg',color:'#075E43'}]},body:{type:'box',layout:'vertical',spacing:'md',contents:body}}}:lineWaitingContactFlex();
    await lineReply(env,event.replyToken,msg);lineBackground(ctx,saveLineEventNonCritical(event,sql,env));return;
  }
  if(t==='ลงทะเบียน'||t.includes('ลงทะเบียน')){
    await lineReply(env,event.replyToken,lineLinkFlex('ลงทะเบียนสมาชิก','หลังได้รับรหัสสมาชิกแล้ว กลับมาพิมพ์ “เชื่อมบัญชี”',lineWebBase()+'register.html?v=2.7.07','เปิดหน้าลงทะเบียน'));
    lineBackground(ctx,saveLineEventNonCritical(event,sql,env));
    return;
  }
  if(['ตรวจสอบสถานะ','สมาชิก','สถานะสมาชิก','ตรวจสอบสมาชิก'].includes(t)||t.startsWith('สมาชิก ')){
    await lineReply(env,event.replyToken,lineLinkFlex('ตรวจสอบสถานะสมาชิก','ค้นหาและตรวจสอบสถานะสมาชิก',lineWebBase()+'status.html?v=2.7.07','ตรวจสอบสถานะ'));
    lineBackground(ctx,saveLineEventNonCritical(event,sql,env));
    return;
  }
  if(t==='สิทธิประโยชน์'||t==='สิทธิ'||t.includes('สิทธิประโยชน์')){
    await lineReply(env,event.replyToken,lineLinkFlex('สิทธิประโยชน์','ดูสิทธิประโยชน์สำหรับสมาชิกที่กำลังเปิดใช้งาน',lineWebBase()+'benefits.html?v=2.7.07','ดูสิทธิประโยชน์'));
    lineBackground(ctx,saveLineEventNonCritical(event,sql,env));
    return;
  }
  if(t==='ติดต่อแอดมิน'||t==='ติดต่อ admin'||t==='contact admin'){
    await lineReply(env,event.replyToken,{type:'text',text:'ติดต่อ Admin ได้เลยค่ะ 💬\n\nพิมพ์ข้อความที่ต้องการส่งได้ทันที หรือพิมพ์ “แอดมิน” เว้นวรรคแล้วตามด้วยข้อความก็ได้ค่ะ\n\nระบบจะบันทึกเข้ากล่อง LINE สมาชิก และเมื่อ Admin ตอบ ระบบจะส่งกลับมาที่ LINE นี้โดยอัตโนมัติ'});
    lineBackground(ctx,saveLineEventNonCritical(event,sql,env));
    return;
  }
  if(t.startsWith('แอดมิน ')||t.startsWith('admin ')){
    const detail=clean(msgText.replace(/^แอดมิน\s+/i,'').replace(/^admin\s+/i,''));
    if(!detail){
      await lineReply(env,event.replyToken,{type:'text',text:'กรุณาพิมพ์รายละเอียดต่อท้ายคำว่า “แอดมิน” เช่น\nแอดมิน ขอสอบถามเรื่องใบเสร็จรับเงิน'});
      return;
    }
    // Reply first, then save to PostgreSQL so a slow DB never consumes the LINE reply token.
    await lineReply(env,event.replyToken,{type:'text',text:'✅ ส่งถึง Admin แล้วค่ะ'});
    await saveLineAdminMessageNonCritical(sql,userId,detail,'in',null,{line_message_id:event?.message?.id,message_type:'text'});
    lineBackground(ctx,saveLineEventNonCritical(event,sql,env));
    return;
  }

  // V2.6.82: generate the account-link URL without touching PostgreSQL first.
  // LINE reply tokens are short-lived; DB/DDL work before replying can make this command appear silent.
  if(t==='เชื่อมบัญชี'||t==='ผูกบัญชี'||t==='เชื่อมสมาชิก'){
    if(!userId){
      await lineReply(env,event.replyToken,{type:'text',text:'ไม่พบ LINE User ID กรุณาลองใหม่จากห้องแชทของบัญชีทางการ'});
      return;
    }
    try{
      const token=await createFastLineLinkToken(userId,env);
      await lineReply(env,event.replyToken,lineLinkFlex('เชื่อมบัญชีสมาชิก','ลิงก์นี้ใช้ได้ 15 นาที และหลังเชื่อมสำเร็จจะใช้ซ้ำไม่ได้',lineWebBase()+'line-link.html?token='+encodeURIComponent(token)+'&v=2.7.07','เชื่อมบัญชี'));
    }catch(err){
      console.error('LINE account-link token error',err);
      await lineReply(env,event.replyToken,{type:'text',text:'ยังไม่สามารถสร้างลิงก์เชื่อมบัญชีได้ กรุณาลองใหม่อีกครั้ง หรือติดต่อ Admin'});
    }
    lineBackground(ctx,saveLineEventNonCritical(event,sql,env));
    return;
  }

  // V2.6.82: LINE Member Self-Service shortcuts. Reply FIRST without PostgreSQL.
  // Member linking/status is resolved only after the signed URL is opened.
  if(['ข้อมูลของฉัน','ข้อมูลสมาชิก','บัญชีสมาชิก'].includes(t)){
    await replyLinePortalShortcut(event,env,userId,'เปิดข้อมูลสมาชิกของฉันได้ที่');
    lineBackground(ctx,saveLineEventNonCritical(event,sql,env));return;
  }
  if(['ประวัติของฉัน','ประวัติ'].includes(t)){
    await lineReply(env,event.replyToken,lineHistoryMenuFlex());
    lineBackground(ctx,saveLineEventNonCritical(event,sql,env));return;
  }
  if(['แก้ไขข้อมูล','แก้ไขข้อมูลส่วนตัว','ข้อมูลส่วนตัว'].includes(t)){
    await replyLinePortalShortcut(event,env,userId,'แก้ไขข้อมูลส่วนตัวได้ที่',{tab:'profile',action:'edit'});
    lineBackground(ctx,saveLineEventNonCritical(event,sql,env));return;
  }
  if(['บัตรสมาชิก','บัตรสมาชิกดิจิทัล','บัตรของฉัน'].includes(t)){
    await replyLinePortalShortcut(event,env,userId,'เปิดบัตรสมาชิกดิจิทัลได้ที่',{tab:'profile',action:'card'});
    lineBackground(ctx,saveLineEventNonCritical(event,sql,env));return;
  }
  if(['ประวัติชำระ','ประวัติชำระสมาชิก','ประวัติการชำระ','ชำระสมาชิก'].includes(t)){
    await replyLinePortalShortcut(event,env,userId,'ดูประวัติชำระสมาชิกได้ที่',{tab:'payments'});
    lineBackground(ctx,saveLineEventNonCritical(event,sql,env));return;
  }
  if(['ประวัติบริจาค','ประวัติการบริจาค','บริจาคของฉัน'].includes(t)){
    await replyLinePortalShortcut(event,env,userId,'ดูประวัติการบริจาคได้ที่',{tab:'donations'});
    lineBackground(ctx,saveLineEventNonCritical(event,sql,env));return;
  }
  if(['ประวัติสิทธิ์','ประวัติสิทธิประโยชน์','ประวัติการใช้สิทธิ','สิทธิ์ของฉัน'].includes(t)){
    await replyLinePortalShortcut(event,env,userId,'ดูประวัติการใช้สิทธิประโยชน์ได้ที่',{tab:'benefits'});
    lineBackground(ctx,saveLineEventNonCritical(event,sql,env));return;
  }

  // V2.7.07: quiet conversation mode. Ordinary member chat is stored without an automatic confirmation bubble.
  const freeText=clean(msgText);
  if(freeText){
    await saveLineAdminMessageNonCritical(sql,userId,freeText,'in',null,{line_message_id:event?.message?.id,message_type:'text'});
    lineBackground(ctx,saveLineEventNonCritical(event,sql,env));
    return;
  }
  await lineReply(env,event.replyToken,{type:'text',text:'พิมพ์ “เมนู” เพื่อดูคำสั่งระบบได้ค่ะ'});
  lineBackground(ctx,saveLineEventNonCritical(event,sql,env));
}

async function ensureReceiptOpsSchema(sql){
  await sql`CREATE TABLE IF NOT EXISTS receipt_books(book_id TEXT PRIMARY KEY,book_year INTEGER NOT NULL,book_no INTEGER NOT NULL,book_code TEXT NOT NULL UNIQUE,start_no INTEGER NOT NULL DEFAULT 1,end_no INTEGER NOT NULL DEFAULT 100,next_no INTEGER NOT NULL DEFAULT 1,status TEXT NOT NULL DEFAULT 'open',created_by TEXT,created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),closed_at TIMESTAMPTZ,UNIQUE(book_year,book_no))`;
  await sql`CREATE TABLE IF NOT EXISTS remittance_reports(report_id TEXT PRIMARY KEY,report_no TEXT NOT NULL UNIQUE,report_date TIMESTAMPTZ NOT NULL DEFAULT NOW(),note TEXT,status TEXT NOT NULL DEFAULT 'active',created_by TEXT,created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),cancelled_at TIMESTAMPTZ,cancelled_by TEXT)`;
  await sql`CREATE TABLE IF NOT EXISTS remittance_items(item_id TEXT PRIMARY KEY,report_id TEXT NOT NULL REFERENCES remittance_reports(report_id) ON DELETE RESTRICT,source_type TEXT NOT NULL,transaction_id TEXT NOT NULL,receipt_no TEXT,amount NUMERIC(12,2) NOT NULL DEFAULT 0,receipt_type TEXT,created_at TIMESTAMPTZ NOT NULL DEFAULT NOW())`;
  await sql`ALTER TABLE remittance_items DROP CONSTRAINT IF EXISTS remittance_items_source_type_transaction_id_key`;
  await sql`CREATE INDEX IF NOT EXISTS idx_remittance_items_source_tx ON remittance_items(source_type,transaction_id)`;
  await sql`CREATE TABLE IF NOT EXISTS remittance_logs(log_id TEXT PRIMARY KEY,report_id TEXT,action TEXT NOT NULL,detail TEXT,admin_by TEXT,created_at TIMESTAMPTZ NOT NULL DEFAULT NOW())`;
  await sql`CREATE INDEX IF NOT EXISTS idx_remittance_logs_created ON remittance_logs(created_at DESC)`;
}
async function allocateReceiptNumber(sql){
  await ensureReceiptOpsSchema(sql);
  const year=new Date().getFullYear()+543;
  const books=await sql`SELECT * FROM receipt_books WHERE book_year=${year} AND status='open' AND next_no<=end_no ORDER BY book_no LIMIT 1 FOR UPDATE`;
  if(!books.length) throw new Error(`ยังไม่มีเล่มใบเสร็จที่เปิดใช้งานสำหรับปี ${year} หรือเล่มปัจจุบันครบ 100 ใบแล้ว กรุณาเพิ่มเล่มใบเสร็จใหม่`);
  const b=books[0],seq=Number(b.next_no),receiptNo=`${b.book_code}-${String(seq).padStart(3,'0')}`;
  await sql`UPDATE receipt_books SET next_no=next_no+1,status=CASE WHEN next_no+1>end_no THEN 'closed' ELSE status END,closed_at=CASE WHEN next_no+1>end_no THEN NOW() ELSE closed_at END WHERE book_id=${b.book_id}`;
  return receiptNo;
}
async function statusAccessToken(code,env){
  const exp=Math.floor(Date.now()/1000)+600,payload=`${String(code||'').toUpperCase()}.${exp}`,secret=clean(env?.ADMIN_API_KEY)||'sk-alumni-status';
  const enc=new TextEncoder(),k=await crypto.subtle.importKey('raw',enc.encode(secret),{name:'HMAC',hash:'SHA-256'},false,['sign']);
  const sig=await crypto.subtle.sign('HMAC',k,enc.encode(payload));
  const hex=Array.from(new Uint8Array(sig)).map(b=>b.toString(16).padStart(2,'0')).join('');return `${exp}.${hex}`;
}
async function verifyStatusAccessToken(code,token,env){
  const [expS,sig]=String(token||'').split('.');const exp=Number(expS);if(!exp||exp<Math.floor(Date.now()/1000))return false;const expected=await statusAccessTokenAt(code,exp,env);return safeEqual(expected,sig);
}
async function statusAccessTokenAt(code,exp,env){const payload=`${String(code||'').toUpperCase()}.${exp}`,secret=clean(env?.ADMIN_API_KEY)||'sk-alumni-status';const enc=new TextEncoder(),k=await crypto.subtle.importKey('raw',enc.encode(secret),{name:'HMAC',hash:'SHA-256'},false,['sign']);const raw=await crypto.subtle.sign('HMAC',k,enc.encode(payload));return Array.from(new Uint8Array(raw)).map(b=>b.toString(16).padStart(2,'0')).join('')}

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
  async fetch(request,env,ctx){
    if(request.method==="OPTIONS") return new Response(null,{status:204,headers:cors(request)});
    const url=new URL(request.url), path=url.pathname.replace(/\/+$/,"")||"/";
    let sql=null;
    try{
      if(path==="/") return json(request,{success:true,app:"SK Alumni API",version:"2.7.07",status:"online",line_webhook:"/api/line/webhook"});
      if(path==="/api/line/health"&&request.method==="GET"){
        return json(request,{success:true,version:"2.7.07",webhook:"/api/line/webhook",channel_secret_configured:!!env.LINE_CHANNEL_SECRET,access_token_configured:!!env.LINE_CHANNEL_ACCESS_TOKEN});
      }
      if(path==="/api/line/webhook"&&request.method==="POST"){
        const raw=await request.text();
        const sig=request.headers.get('x-line-signature')||'';
        if(!env.LINE_CHANNEL_SECRET||!env.LINE_CHANNEL_ACCESS_TOKEN) return json(request,{success:false,message:'LINE secrets are not configured'},503);
        if(!(await verifyLineSignature(raw,sig,env.LINE_CHANNEL_SECRET))) return json(request,{success:false,message:'Invalid LINE signature'},401);
        let payload={};try{payload=JSON.parse(raw||'{}')}catch{return json(request,{success:false,message:'Invalid JSON'},400)}
        const events=Array.isArray(payload.events)?payload.events:[];
        if(!events.length) return json(request,{success:true,verified:true,events:0});
        sql=db(env);
        for(const event of events){try{await handleLineEvent(event,env,sql,ctx)}catch(e){console.error('LINE event failed',e)}}
        // Do NOT let fetch.finally() close the PG client before waitUntil() persistence finishes.
        // The LINE reply remains fast, while event/inbox writes complete in the background.
        const lineSql=sql;
        const lineTasks=Array.isArray(ctx?.__skLineTasks)?ctx.__skLineTasks.slice():[];
        if(ctx&&typeof ctx.waitUntil==='function'){
          const closeAfter=Promise.allSettled(lineTasks).finally(()=>lineSql.end().catch(()=>{}));
          ctx.waitUntil(closeAfter);
          sql=null; // ownership moved to closeAfter
        }
        return json(request,{success:true,verified:true,events:events.length,background_jobs:lineTasks.length});
      }
      sql=db(env);
      if(/^\/api\/line\/media\/[^/]+$/.test(path)&&request.method==="GET"){
        await ensureLineSchema(sql);
        const mid=decodeURIComponent(path.split('/').pop()),token=clean(new URL(request.url).searchParams.get('token'));
        const rows=await sql`SELECT attachment_data,attachment_preview_data,attachment_name,attachment_type,attachment_token FROM line_admin_messages WHERE message_id=${mid} LIMIT 1`;
        if(!rows.length||!token||!safeEqual(token,clean(rows[0].attachment_token)))return new Response('Not found',{status:404});
        const isPreview=new URL(request.url).searchParams.get('preview')==='1';const part=dataUrlParts(isPreview&&rows[0].attachment_preview_data?rows[0].attachment_preview_data:rows[0].attachment_data);if(!part)return new Response('Not found',{status:404});
        const bytes=base64ToBytes(part.base64),name=clean(rows[0].attachment_name)||'line-attachment';
        return new Response(bytes,{headers:{'Content-Type':clean(rows[0].attachment_type)||part.mime||'application/octet-stream','Content-Disposition':'inline; filename*=UTF-8\'\''+encodeURIComponent(name),'Cache-Control':'private, max-age=3600','X-Content-Type-Options':'nosniff'}});
      }
      if(path==="/api/admin/line/messages"&&request.method==="GET"){
        const denied=await requireAdmin(request,env,sql);if(denied)return denied;
        await recoverLineAdminMessages(sql);
        // V2.7.07: durable Inbox + direct LINE-event fallback.
        // Even if an older background Inbox insert was missed, the Admin can still see the conversation.
        const rows=await sql`
          WITH durable AS (
            SELECT lam.message_id,lam.line_user_id,lam.member_code,lam.direction,lam.message_text,lam.status,lam.admin_by,lam.created_at,lam.read_at,lam.message_type,lam.attachment_name,lam.attachment_type,lam.attachment_token,(lam.attachment_data IS NOT NULL AND lam.attachment_data<>'') AS has_attachment,
                   lu.display_name,lu.picture_url,lu.status_message,m.prefix,m.first_name,m.last_name,m.full_name
            FROM line_admin_messages lam
            LEFT JOIN line_users lu ON lu.line_user_id=lam.line_user_id
            LEFT JOIN members m ON m.member_code=lam.member_code
          ), fallback AS (
            SELECT 'LEL-'||lel.log_id AS message_id,lel.line_user_id,lu.member_code,'in'::text AS direction,
                   CASE WHEN lel.message_text ~* '^(แอดมิน|admin)[[:space:]]+'
                        THEN REGEXP_REPLACE(lel.message_text,'^(แอดมิน|admin)[[:space:]]+','','i')
                        ELSE lel.message_text END AS message_text,
                   'received'::text AS status,NULL::text AS admin_by,lel.created_at,NULL::timestamptz AS read_at,'text'::text AS message_type,NULL::text AS attachment_name,NULL::text AS attachment_type,NULL::text AS attachment_token,FALSE AS has_attachment,
                   lu.display_name,lu.picture_url,lu.status_message,m.prefix,m.first_name,m.last_name,m.full_name
            FROM line_event_logs lel
            LEFT JOIN line_users lu ON lu.line_user_id=lel.line_user_id
            LEFT JOIN members m ON m.member_code=lu.member_code
            WHERE lel.event_type='message' AND lel.message_type='text' AND lel.line_user_id IS NOT NULL
              AND COALESCE(NULLIF(TRIM(lel.message_text),''),'')<>''
              AND LOWER(TRIM(lel.message_text)) NOT IN (
                'เมนู','menu','help','ช่วยเหลือ','คำสั่ง','ลงทะเบียน','ตรวจสอบสถานะ','สมาชิก','สถานะสมาชิก','ตรวจสอบสมาชิก',
                'หน้าหลัก','สนับสนุนรายปี','บริจาค','โทรหาแอดมิน','สิทธิประโยชน์','สิทธิ','ติดต่อแอดมิน','ติดต่อ admin','contact admin','เชื่อมบัญชี','ผูกบัญชี','เชื่อมสมาชิก',
                'ข้อมูลของฉัน','ข้อมูลสมาชิก','บัญชีสมาชิก','แก้ไขข้อมูล','แก้ไขข้อมูลส่วนตัว','ข้อมูลส่วนตัว','บัตรสมาชิก','บัตรสมาชิกดิจิทัล','บัตรของฉัน',
                'ประวัติของฉัน','ประวัติ','ประวัติชำระ','ประวัติชำระสมาชิก','ประวัติการชำระ','ชำระสมาชิก','ประวัติบริจาค','ประวัติการบริจาค','บริจาคของฉัน',
                'ประวัติสิทธิ์','ประวัติสิทธิประโยชน์','ประวัติการใช้สิทธิ','สิทธิ์ของฉัน'
              )
              AND NOT EXISTS (
                SELECT 1 FROM line_admin_messages lam
                WHERE lam.line_user_id=lel.line_user_id AND lam.direction='in'
                  AND lam.created_at BETWEEN lel.created_at-INTERVAL '30 seconds' AND lel.created_at+INTERVAL '30 seconds'
                  AND lam.message_text=(CASE WHEN lel.message_text ~* '^(แอดมิน|admin)[[:space:]]+' THEN REGEXP_REPLACE(lel.message_text,'^(แอดมิน|admin)[[:space:]]+','','i') ELSE lel.message_text END)
              )
          )
          SELECT * FROM durable UNION ALL SELECT * FROM fallback ORDER BY created_at DESC LIMIT 2000`;
        const unread=rows.filter(r=>r.direction==='in'&&!r.read_at).length;
        return json(request,{success:true,data:rows,unread});
      }
      if(path==="/api/admin/line/events"&&request.method==="GET"){
        const denied=await requireAdmin(request,env,sql);if(denied)return denied;
        await ensureLineSchema(sql);
        const rows=await sql`SELECT lel.log_id AS message_id,lel.line_user_id,lu.member_code,'event'::text AS direction,COALESCE(lel.message_text,lel.event_type||COALESCE('/'||lel.message_type,'')) AS message_text,lel.event_type AS status,NULL::text AS admin_by,lel.created_at,NULL::timestamptz AS read_at,lu.display_name,lu.picture_url,lu.status_message,m.prefix,m.first_name,m.last_name,m.full_name,lel.message_type FROM line_event_logs lel LEFT JOIN line_users lu ON lu.line_user_id=lel.line_user_id LEFT JOIN members m ON m.member_code=lu.member_code ORDER BY lel.created_at DESC LIMIT 2000`;
        return json(request,{success:true,data:rows});
      }
      if(path==="/api/admin/line/diagnostics"&&request.method==="GET"){
        const denied=await requireAdmin(request,env,sql);if(denied)return denied;
        await ensureLineSchema(sql);
        const counts=await sql`SELECT
          (SELECT COUNT(*)::int FROM line_users) line_users,
          (SELECT COUNT(*)::int FROM line_users WHERE member_code IS NOT NULL) linked_users,
          (SELECT COUNT(*)::int FROM line_event_logs) event_logs,
          (SELECT COUNT(*)::int FROM line_admin_messages WHERE direction='in') inbox_in,
          (SELECT COUNT(*)::int FROM line_admin_messages WHERE direction='in' AND read_at IS NULL) unread`;
        const latest=await sql`SELECT line_user_id,message_text,created_at FROM line_event_logs WHERE event_type='message' AND message_type='text' ORDER BY created_at DESC LIMIT 1`;
        return json(request,{success:true,data:counts[0]||{},latest_event:latest[0]||null});
      }
      if(path==="/api/admin/line/reply"&&request.method==="POST"){
        const denied=await requireAdmin(request,env,sql);if(denied)return denied;
        const b=await body(request),uid=clean(b.line_user_id),text=clean(b.message_text),admin=await currentAdminLabel(request,env,sql),att=clean(b.attachment_data),preview=clean(b.attachment_preview_data),attName=clean(b.attachment_name),attType=clean(b.attachment_type);
        if(!uid||(!text&&!att))return json(request,{success:false,message:'กรุณาระบุผู้รับและข้อความ/ไฟล์'},400);
        if(att&&!lineAttachmentOK(att))return json(request,{success:false,message:'รองรับรูป JPG/PNG/WEBP/GIF, PDF, TXT, ZIP, Word, Excel ขนาดไม่เกินประมาณ 5 MB'},400);
        const messageId=id('LCM'),mediaToken=lineRandomToken(),messageType=att?(/^image\/(jpeg|jpg|png)$/i.test(String(attType))?'image':'file'):'text';
        // Text replies take the fast path: send to LINE immediately, then persist the
        // conversation and read-state in a separate background database session.
        if(!att){
          const pushed=await linePush(env,uid,{type:'text',text:text.slice(0,5000)});
          if(!pushed?.ok)return json(request,{success:false,message:'ส่งข้อความ LINE ไม่สำเร็จ'},502);
          const persist=(async()=>{const bg=db(env);try{
            await ensureLineSchema(bg);
            const linked=await bg`SELECT member_code FROM line_users WHERE line_user_id=${uid} LIMIT 1`;
            await bg`INSERT INTO line_admin_messages(message_id,line_user_id,member_code,direction,message_text,status,admin_by,created_at,message_type,attachment_token) VALUES(${messageId},${uid},${linked[0]?.member_code||null},'out',${text},'sent',${admin},NOW(),'text',${mediaToken}) ON CONFLICT DO NOTHING`;
            await bg`UPDATE line_admin_messages SET read_at=COALESCE(read_at,NOW()),status=CASE WHEN direction='in' THEN 'read' ELSE status END WHERE line_user_id=${uid} AND direction='in'`;
          }catch(err){console.error('LINE fast reply persistence failed',err)}finally{await bg.end().catch(()=>{})}})();
          if(ctx&&typeof ctx.waitUntil==='function')ctx.waitUntil(persist);else await persist;
          return json(request,{success:true,message:'ส่งข้อความถึงสมาชิกแล้ว',message_id:messageId,created_at:new Date().toISOString(),admin_by:admin,message_type:'text'});
        }
        await ensureLineSchema(sql);
        const linked=await sql`SELECT member_code FROM line_users WHERE line_user_id=${uid} LIMIT 1`;
        await sql`INSERT INTO line_admin_messages(message_id,line_user_id,member_code,direction,message_text,status,admin_by,created_at,message_type,attachment_data,attachment_name,attachment_type,attachment_token)
          VALUES(${messageId},${uid},${linked[0]?.member_code||null},'out',${text||attachmentLabel(attType,attName)},'pending',${admin},NOW(),${messageType},${att||null},${attName||null},${attType||null},${mediaToken})`;
        if(preview)await sql`UPDATE line_admin_messages SET attachment_preview_data=${preview} WHERE message_id=${messageId}`;
        const messages=[];
        if(text)messages.push({type:'text',text:text.slice(0,5000)});
        if(att){
          const mediaUrl=publicLineMediaUrl(request,messageId,mediaToken);
          if(messageType==='image')messages.push({type:'image',originalContentUrl:mediaUrl,previewImageUrl:mediaUrl+'&preview=1'});
          else messages.push({type:'flex',altText:'📎 '+(attName||'ไฟล์จาก Admin'),contents:{type:'bubble',size:'kilo',body:{type:'box',layout:'vertical',spacing:'sm',contents:[{type:'text',text:'📎 '+(attName||'ไฟล์จาก Admin'),weight:'bold',wrap:true,color:'#08744c',action:{type:'uri',label:'เปิดไฟล์',uri:mediaUrl}},{type:'text',text:'ส่งโดย '+admin,size:'xs',color:'#718096',wrap:true}]},footer:{type:'box',layout:'vertical',contents:[{type:'button',style:'primary',height:'sm',color:'#08744c',action:{type:'uri',label:'เปิดไฟล์',uri:mediaUrl}}]}}});
        }
        const pushed=await linePush(env,uid,messages);
        if(!pushed?.ok){await sql`UPDATE line_admin_messages SET status='failed' WHERE message_id=${messageId}`;return json(request,{success:false,message:'ส่งข้อความ LINE ไม่สำเร็จ'},502)}
        await sql`UPDATE line_admin_messages SET status='sent' WHERE message_id=${messageId}`;
        await sql`UPDATE line_admin_messages SET read_at=COALESCE(read_at,NOW()),status=CASE WHEN direction='in' THEN 'read' ELSE status END WHERE line_user_id=${uid} AND direction='in'`;
        return json(request,{success:true,message:'ส่งข้อความถึงสมาชิกแล้ว',message_id:messageId,created_at:new Date().toISOString(),admin_by:admin,message_type:messageType});
      }
      if(path==="/api/admin/line/read"&&request.method==="POST"){
        const denied=await requireAdmin(request,env,sql);if(denied)return denied;await ensureLineSchema(sql);
        const b=await body(request),uid=clean(b.line_user_id);if(uid)await sql`UPDATE line_admin_messages SET read_at=COALESCE(read_at,NOW()),status=CASE WHEN direction='in' THEN 'read' ELSE status END WHERE line_user_id=${uid} AND direction='in'`;
        return json(request,{success:true});
      }
      if(path==="/api/admin/line/storage"&&request.method==="GET"){
        const denied=await requireAdmin(request,env,sql);if(denied)return denied;await ensureLineSchema(sql);
        const summary=await sql`SELECT COUNT(*)::int AS total_messages,COUNT(*) FILTER(WHERE direction='in')::int AS incoming,COUNT(*) FILTER(WHERE direction='out')::int AS outgoing,COUNT(*) FILTER(WHERE message_type='image')::int AS images,COUNT(*) FILTER(WHERE message_type='file')::int AS files,COUNT(*) FILTER(WHERE attachment_data IS NOT NULL AND attachment_data<>'')::int AS stored_media,COALESCE(SUM(LENGTH(COALESCE(attachment_data,''))+LENGTH(COALESCE(attachment_preview_data,''))),0)::bigint AS approx_chars FROM line_admin_messages`;
        const items=await sql`SELECT message_id,line_user_id,member_code,direction,message_type,message_text,attachment_name,attachment_type,created_at,read_at,(attachment_data IS NOT NULL AND attachment_data<>'') AS has_attachment,(LENGTH(COALESCE(attachment_data,''))+LENGTH(COALESCE(attachment_preview_data,'')))::bigint AS stored_chars FROM line_admin_messages ORDER BY created_at DESC LIMIT 2000`;
        return json(request,{success:true,data:summary[0]||{},items});
      }
      if(path==="/api/admin/line/storage/manage"&&request.method==="POST"){
        const denied=await requireAdmin(request,env,sql);if(denied)return denied;await ensureLineSchema(sql);const b=await body(request),action=clean(b.action),ids=Array.isArray(b.message_ids)?b.message_ids.map(clean).filter(Boolean).slice(0,500):[],days=Math.max(1,Math.min(3650,Number(b.older_days||90)));
        if(action==='delete_selected'&&ids.length){const packed=ids.join('\n');const r=await sql`DELETE FROM line_admin_messages WHERE message_id IN (SELECT unnest(string_to_array(${packed}, E'\n'))) RETURNING message_id`;return json(request,{success:true,deleted:r.length})}
        if(action==='purge_media_selected'&&ids.length){const packed=ids.join('\n');const r=await sql`UPDATE line_admin_messages SET attachment_data=NULL,attachment_preview_data=NULL,attachment_token=NULL WHERE message_id IN (SELECT unnest(string_to_array(${packed}, E'\n'))) RETURNING message_id`;return json(request,{success:true,updated:r.length})}
        if(action==='purge_old_media'){const r=await sql`UPDATE line_admin_messages SET attachment_data=NULL,attachment_preview_data=NULL,attachment_token=NULL WHERE created_at < NOW()-(${days}::text||' days')::interval AND attachment_data IS NOT NULL RETURNING message_id`;return json(request,{success:true,updated:r.length})}
        if(action==='delete_old_messages'){const r=await sql`DELETE FROM line_admin_messages WHERE created_at < NOW()-(${days}::text||' days')::interval RETURNING message_id`;return json(request,{success:true,deleted:r.length})}
        return json(request,{success:false,message:'ไม่พบคำสั่งจัดการข้อมูล'},400);
      }
      if(path==="/api/health"&&request.method==="GET"){
        const r=await sql`SELECT current_database() database,NOW() server_time`;
        return json(request,{success:true,service:"sk-alumni-api",database:r[0].database,server_time:r[0].server_time,version:"2.7.07"});
      }

      if(path==="/api/settings/public"&&request.method==="GET"){
        const rows=await sql`SELECT setting_key,setting_value FROM app_settings WHERE setting_key IN ('APP_NAME','APP_VERSION','MEMBERSHIP_FEE_YEARLY','MEMBERSHIP_FEE_MONTHLY','PROMPTPAY','BANK_ACCOUNT_NAME','BANK_NAME','BANK_ACCOUNT_NO','CONTACT_EMAIL','CONTACT_PHONE','CONTACT_PHONE_ENABLED','ASSOCIATION_ADDRESS','HOME_QUOTE','HOME_QUOTE_BY','HOME_NEWS_TITLE','HOME_HERO_IMAGE','HOME_HERO_MOBILE_IMAGE') ORDER BY setting_key`;
        const data={};for(const r of rows)data[r.setting_key]=r.setting_value;data.APP_VERSION='V2.7.07';
        return json(request,{success:true,data});
      }

      if(path==="/api/payment-topics/public"&&request.method==="GET"){
        await ensureV2616Schema(sql);
        // Public page must never fail just because an older DB schema is still deployed.
        // Read settings first and fall back to the annual membership topic if topic-table access fails.
        const feeRows=await sql`SELECT setting_value FROM app_settings WHERE setting_key='MEMBERSHIP_FEE_YEARLY' LIMIT 1`;
        const fee=Number(feeRows[0]?.setting_value||0)||null;
        try{
          const rows=await sql`SELECT topic_id,title,description,amount FROM payment_topics WHERE active=TRUE ORDER BY title`;
          const mapped=(rows||[]).map(r=>r.topic_id==='membership'?{...r,amount:fee??r.amount}:r);
          mapped.sort((a,b)=>a.topic_id==='membership'?-1:b.topic_id==='membership'?1:String(a.title||'').localeCompare(String(b.title||''),'th'));
          if(mapped.length)return json(request,{success:true,data:mapped});
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

      if(path==="/api/line/link-status"&&request.method==="POST"){
        const b=await body(request),token=clean(b.token);
        if(!token)return json(request,{success:false,message:'ไม่พบลิงก์ยืนยันจาก LINE'},400);
        const verified=await verifyFastLineLinkToken(token,env);
        if(!verified)return json(request,{success:false,message:'ลิงก์เชื่อมบัญชีหมดอายุหรือไม่ถูกต้อง กรุณากลับ LINE แล้วพิมพ์ “เชื่อมบัญชี” ใหม่'},410);
        const linked=await linkedLineMember(sql,verified.line_user_id);
        if(!linked)return json(request,{success:true,data:{linked:false}});
        return json(request,{success:true,data:{linked:true,member_code:linked.member_code,member_name:lineMemberName(linked)}});
      }

      if(path==="/api/line/link-account"&&request.method==="POST"){
        const b=await body(request),token=clean(b.token),code=clean(b.member_code).toUpperCase(),identity=clean(b.identity);
        if(!token||!code||!identity)return json(request,{success:false,message:'กรุณากรอกข้อมูลให้ครบ'},400);
        const verified=await verifyFastLineLinkToken(token,env);
        if(!verified)return json(request,{success:false,message:'ลิงก์เชื่อมบัญชีหมดอายุหรือไม่ถูกต้อง กรุณากลับ LINE แล้วพิมพ์ “เชื่อมบัญชี” ใหม่'},410);
        await ensureLineSchema(sql);
        const hash=await sha256Hex(token);
        const used=await sql`SELECT token_hash FROM line_link_tokens WHERE token_hash=${hash} AND used_at IS NOT NULL LIMIT 1`;
        if(used.length)return json(request,{success:false,message:'ลิงก์เชื่อมบัญชีนี้ถูกใช้งานแล้ว กรุณากลับ LINE แล้วพิมพ์ “เชื่อมบัญชี” ใหม่'},410);
        const mr=await memberWithAddress(sql,code);
        if(!mr.length)return json(request,{success:false,message:'ไม่พบรหัสสมาชิก'},404);
        const m=mr[0],st=effectiveMemberStatus(m);
        if(st!=='active')return json(request,{success:false,message:st==='renewal'?'สมาชิกอยู่ในสถานะรอต่ออายุ กรุณาต่ออายุสมาชิกก่อนเชื่อมบัญชี':'บัญชีสมาชิกยังไม่อยู่ในสถานะใช้งาน'},403);
        if(!identityMatches(m,identity))return json(request,{success:false,message:'อีเมลหรือเบอร์โทรศัพท์ไม่ตรงกับข้อมูลสมาชิก'},401);
        const uid=clean(verified.line_user_id);
        const occupied=await sql`SELECT line_user_id FROM line_users WHERE member_code=${code} AND line_user_id<>${uid} AND follow_status='active' LIMIT 1`;
        const memberOccupied=await sql`SELECT line_user_id FROM members WHERE member_code=${code} AND line_user_id IS NOT NULL AND line_user_id<>${uid} LIMIT 1`;
        if(occupied.length||memberOccupied.length)return json(request,{success:false,message:'รหัสสมาชิกนี้เชื่อมกับ LINE อื่นอยู่แล้ว กรุณาติดต่อ Admin หากต้องการเปลี่ยนบัญชี LINE'},409);
        await sql.begin(async tx=>{
          await tx`INSERT INTO line_users(line_user_id,follow_status,last_seen_at,created_at,updated_at) VALUES(${uid},'active',NOW(),NOW(),NOW()) ON CONFLICT(line_user_id) DO NOTHING`;
          await tx`UPDATE members SET line_user_id=NULL,updated_at=NOW() WHERE line_user_id=${uid} AND member_code<>${code}`;
          await tx`UPDATE line_users SET member_code=${code},follow_status='active',last_seen_at=NOW(),updated_at=NOW() WHERE line_user_id=${uid}`;
          const profile=await tx`SELECT display_name FROM line_users WHERE line_user_id=${uid} LIMIT 1`,lineId=clean(profile[0]?.display_name);
          // LINE Display Name is returned by Messaging API returned by Messaging API.
          // Refresh it at every confirmed link so an empty or stale admin field is corrected.
          await tx`UPDATE members SET line_user_id=${uid},line_id=COALESCE(NULLIF(${lineId},''),line_id),updated_at=NOW() WHERE member_code=${code}`;
          await tx`INSERT INTO line_link_tokens(token_hash,line_user_id,expires_at,used_at,created_at) VALUES(${hash},${uid},${verified.expires_at},NOW(),NOW()) ON CONFLICT(token_hash) DO UPDATE SET used_at=NOW()`;
        });
        return json(request,{success:true,message:'เชื่อมบัญชี LINE สำเร็จ',data:{member_code:code,member_name:lineMemberName(m)}});
      }

      if(path==="/api/line/member-entry"&&request.method==="POST"){
        const b=await body(request),token=clean(b.token);
        if(!token)return json(request,{success:false,message:'ไม่พบลิงก์ยืนยันจาก LINE'},400);
        const verified=await verifyFastLinePortalToken(token,env);
        if(!verified)return json(request,{success:false,message:'ลิงก์ข้อมูลสมาชิกหมดอายุหรือไม่ถูกต้อง กรุณากลับ LINE แล้วพิมพ์ “ข้อมูลของฉัน” ใหม่'},401);
        const linked=await linkedLineMember(sql,verified.line_user_id);
        if(!linked)return json(request,{success:false,message:'LINE นี้ยังไม่ได้เชื่อมกับบัญชีสมาชิก กรุณากลับ LINE แล้วพิมพ์ “เชื่อมบัญชี” ก่อน'},404);
        if(linked.status!=='active')return json(request,{success:false,message:'สมาชิก '+linked.member_code+' ยังไม่อยู่ในสถานะใช้งาน กรุณาตรวจสอบสถานะสมาชิก'},403);
        const statusToken=await statusAccessToken(linked.member_code,env);
        return json(request,{success:true,data:{member_code:linked.member_code,member_name:lineMemberName(linked),status_token:statusToken}});
      }

      if(/^\/api\/status\//.test(path)&&request.method==="GET"){
        const code=decodeURIComponent(path.split('/').pop()).toUpperCase();
        const rows=await sql`SELECT member_code,prefix,first_name,last_name,full_name,arabic_name,status,registered_at,member_start,member_expire FROM members WHERE member_code=${code} LIMIT 1`;
        if(!rows.length)return json(request,{success:true,found:false,message:"ไม่พบข้อมูลสมาชิก"},404);
        const eff=effectiveMemberStatus(rows[0]);return json(request,{success:true,found:true,data:{...rows[0],status:eff},access_token:eff==='active'?await statusAccessToken(code,env):null});
      }


      if(path==="/api/member/status-portal"&&request.method==="POST"){
        const b=await body(request),code=clean(b.member_code).toUpperCase(),token=clean(b.token);if(!code||!token)return json(request,{success:false,message:'ข้อมูลยืนยันไม่ครบ'},400);
        if(!await verifyStatusAccessToken(code,token,env))return json(request,{success:false,message:'ลิงก์เข้าสู่ข้อมูลสมาชิกหมดอายุ กรุณาตรวจสอบสถานะใหม่'},401);
        const rows=await memberWithAddress(sql,code);if(!rows.length)return json(request,{success:false,message:'ไม่พบสมาชิก'},404);const m=rows[0],st=effectiveMemberStatus(m);if(st!=='active')return json(request,{success:false,message:'สมาชิกยังไม่อยู่ในสถานะใช้งาน'},403);
        let payments=[],donations=[],usages=[],benefits=[],editHistory=[];
        try{payments=await sql`SELECT payment_id,payment_type,amount,paid_at,status,note,receipt_no,receipt_issued_at FROM payments WHERE member_code=${code} ORDER BY paid_at DESC,created_at DESC LIMIT 200`}catch{}
        try{donations=await sql`SELECT donation_id,amount,donated_at,status,note,receipt_no,receipt_issued_at FROM donations WHERE member_code=${code} ORDER BY donated_at DESC,created_at DESC LIMIT 200`}catch{}
        try{await ensureBenefitsSchema(sql);usages=await sql`SELECT u.usage_id,u.benefit_id,bf.title,u.used_at,u.amount,u.note,('USE-'||u.usage_id) AS reference_no FROM benefit_usage u LEFT JOIN benefits bf ON bf.benefit_id=u.benefit_id WHERE u.member_code=${code} AND u.active=TRUE ORDER BY u.used_at DESC,u.created_at DESC LIMIT 200`;benefits=await sql`SELECT benefit_id,title,description,start_date,end_date FROM benefits WHERE active=TRUE AND (start_date IS NULL OR start_date<=CURRENT_DATE) AND (end_date IS NULL OR end_date>=CURRENT_DATE) ORDER BY created_at DESC LIMIT 100`}catch{}
        try{const ex=await sql`SELECT to_regclass('public.member_edit_history') t`;if(ex[0]?.t)editHistory=await sql`SELECT edit_id,changed_fields,change_summary,source,old_data,new_data,changed_at FROM member_edit_history WHERE member_code=${code} ORDER BY changed_at DESC LIMIT 200`}catch{}
        const paid=x=>['ชำระแล้ว','อนุมัติ','approved','paid','verified'].includes(String(x.status||'').toLowerCase()),donOK=x=>['ตรวจสอบแล้ว','อนุมัติ','approved','verified'].includes(String(x.status||'').toLowerCase()),sum=a=>a.reduce((n,x)=>n+Number(x.amount||0),0);
        const memberCardToken=await cardToken(code,env);
        return json(request,{success:true,data:{member:{member_code:m.member_code,prefix:m.prefix,first_name:m.first_name,last_name:m.last_name,full_name:m.full_name,arabic_name:m.arabic_name,status:st,phone:m.phone,email:m.email,photo_data:m.photo_data,member_start:m.member_start,member_expire:m.member_expire,registered_at:m.registered_at,address:{address_line:m.address_line,subdistrict:m.subdistrict,district:m.district,province:m.province,postal_code:m.postal_code}},summary:{payments_total:sum(payments.filter(paid)),donations_total:sum(donations.filter(donOK)),benefits_used:usages.length},payments,donations,benefit_usage:usages,benefits,edit_history:editHistory,card_token:memberCardToken}});
      }

      if(path==="/api/member/login"&&request.method==="POST"){
        const b=await body(request);const code=clean(b.member_code).toUpperCase(),identity=clean(b.identity).toLowerCase();
        const rows=await memberWithAddress(sql,code);
        if(!rows.length)return json(request,{success:false,message:"ไม่พบข้อมูลสมาชิก"},404);const m=rows[0];
        { const eff=effectiveMemberStatus(m); if(eff!=="active")return json(request,{success:false,message:eff==="renewal"?"สมาชิกอยู่ในสถานะรอต่ออายุสมาชิก กรุณาชำระค่าบำรุงสมาชิกรายปี":"สมาชิกยังไม่อยู่ในสถานะใช้งาน",status:eff},403); }
        if(!identityMatches(m,identity))return json(request,{success:false,message:"อีเมลหรือเบอร์โทรไม่ตรงกับข้อมูลสมาชิก"},401);
        return json(request,{success:true,data:{member_code:m.member_code,prefix:m.prefix,first_name:m.first_name,last_name:m.last_name,full_name:m.full_name,arabic_name:m.arabic_name,status:"active",phone:m.phone,email:m.email,photo_data:m.photo_data,member_start:m.member_start,member_expire:m.member_expire,address:{address_line:m.address_line,subdistrict:m.subdistrict,district:m.district,province:m.province,postal_code:m.postal_code}}});
      }


      if(path==="/api/member/portal"&&request.method==="POST"){
        const b=await body(request);
        const code=clean(b.member_code).toUpperCase(),identity=clean(b.identity).toLowerCase();
        if(!code||!identity)return json(request,{success:false,message:"กรุณากรอกรหัสสมาชิกและอีเมลหรือเบอร์โทรศัพท์"},400);

        const rows=await memberWithAddress(sql,code);
        if(!rows.length)return json(request,{success:false,message:"ไม่พบข้อมูลสมาชิก"},404);
        const m=rows[0];
        { const eff=effectiveMemberStatus(m); if(eff!=="active")return json(request,{success:false,message:eff==="renewal"?"สมาชิกอยู่ในสถานะรอต่ออายุสมาชิก กรุณาชำระค่าบำรุงสมาชิกรายปี":"สมาชิกยังไม่อยู่ในสถานะใช้งาน",status:eff},403); }
        if(!identityMatches(m,identity))return json(request,{success:false,message:"อีเมลหรือเบอร์โทรไม่ตรงกับข้อมูลสมาชิก"},401);

        // Portal V2.6.5: โมดูลประวัติแต่ละส่วนต้องไม่ทำให้ทั้ง Portal ล่ม
        let payments=[],donations=[],usages=[],benefits=[],editHistory=[];
        const moduleWarnings=[];

        try{
          payments=await sql`
            SELECT payment_id,payment_type,amount,paid_at,status,note,receipt_no,receipt_issued_at
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
            SELECT donation_id,amount,donated_at,status,note,receipt_no,receipt_issued_at
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
              SELECT u.usage_id,u.benefit_id,bf.title,u.used_at,u.amount,u.note,('USE-'||u.usage_id) AS reference_no
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
        notifyLinkedMemberBackground(ctx,env,code,`📩 ระบบได้รับแจ้งชำระแล้ว\nรายการ: ${paymentType}\nจำนวน ${amount.toLocaleString('th-TH')} บาท\nวันที่โอน: ${lineDateTime(b.paid_at||new Date())}\nสถานะ: รอผู้ดูแลตรวจสอบ`);
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
        if(memberCode)notifyLinkedMemberBackground(ctx,env,memberCode,`📩 ระบบได้รับข้อมูลการบริจาคแล้ว\nรายการ: ${topicRows[0].title}\nจำนวน ${amount.toLocaleString('th-TH')} บาท\nวันที่โอน: ${lineDateTime(b.donated_at||new Date())}\nสถานะ: รอผู้ดูแลตรวจสอบ`);
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
        const denied=await requireAdmin(request,env,sql);if(denied)return denied;await ensureBenefitsSchema(sql);await ensureAccountingSchema(sql);
        const b=await body(request),code=clean(b.member_code).toUpperCase(),benefitId=clean(b.benefit_id),amount=Math.max(0,Number(b.amount||0)),att=clean(b.attachment_data)||null;if(att&&!ledgerAttachmentOK(att))return json(request,{success:false,message:'หลักฐานรองรับ JPG/PNG/WEBP/PDF ขนาดไม่เกินประมาณ 2 MB'},400);
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
        await sql`INSERT INTO benefit_usage(usage_id,member_code,benefit_id,used_at,recorded_by,note,amount,active,created_at,updated_at,attachment_data,attachment_name,attachment_type) VALUES(${usageId},${code},${benefitId},${b.used_at||new Date().toISOString()},${await currentAdminLabel(request,env,sql)},${clean(b.note)||null},${amount},TRUE,NOW(),NOW(),${att},${clean(b.attachment_name)||null},${clean(b.attachment_type)||null})`;
        const bn=await sql`SELECT title FROM benefits WHERE benefit_id=${benefitId} LIMIT 1`;if(amount>0){await sql`INSERT INTO ledger_entries(entry_id,entry_date,entry_type,category,source,amount,reference_type,reference_id,member_code,description,note,created_by,status,created_at,updated_at,attachment_data,attachment_name,attachment_type) VALUES(${id('LED')},${b.used_at||new Date().toISOString()},'รายจ่าย','สิทธิประโยชน์สมาชิก','benefit_usage',${amount},'benefit_usage',${usageId},${code},${'ค่าใช้สิทธิ์: '+(bn[0]?.title||benefitId)},${clean(b.note)||null},'admin','posted',NOW(),NOW(),${att},${clean(b.attachment_name)||null},${clean(b.attachment_type)||null})`;}
        notifyLinkedMemberBackground(ctx,env,code,`🎁 บันทึกการใช้สิทธิประโยชน์แล้ว\nสิทธิ์: ${bn[0]?.title||benefitId}\nเมื่อ ${lineDateTime(b.used_at||new Date())}${amount>0?`\nมูลค่า ${amount.toLocaleString('th-TH')} บาท`:''}`);
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
        await ensureBenefitsSchema(sql);
        const rows=await sql`SELECT benefit_id,title,description,start_date,end_date FROM benefits WHERE active=TRUE AND (start_date IS NULL OR start_date<=CURRENT_DATE) AND (end_date IS NULL OR end_date>=CURRENT_DATE) ORDER BY created_at DESC`;
        return json(request,{success:true,data:rows});
      }

      if(path==="/api/admin/auth-check"&&request.method==="GET"){
        const denied=await requireAdmin(request,env,sql);if(denied)return denied;
        const a=await resolveAdmin(request,env,sql);return json(request,{success:true,authorized:true,version:"2.7.07",admin:a});
      }

      if(path==="/api/admin/members"&&request.method==="GET"){
        const denied=await requireAdmin(request,env,sql);if(denied)return denied;
        // Auth สำเร็จต้องเข้าโมดูลได้ แม้ schema เสริมของสมาชิก/ที่อยู่ยังไม่สมบูรณ์
        try{await ensureMemberAdminSchema(sql)}catch(e){console.error("ensureMemberAdminSchema",e)}
        let rows=[];
        try{
          rows=await sql`SELECT m.*,a.address_line,a.subdistrict,a.district,a.province,a.postal_code,COALESCE(NULLIF(m.line_id,''),(SELECT display_name FROM line_users WHERE member_code=m.member_code ORDER BY updated_at DESC NULLS LAST LIMIT 1)) AS auto_line_id,COALESCE((SELECT line_user_id FROM line_users WHERE member_code=m.member_code ORDER BY updated_at DESC NULLS LAST LIMIT 1),m.line_user_id) AS linked_line_user_id FROM members m LEFT JOIN addresses a ON a.member_code=m.member_code ORDER BY m.registered_at DESC`;
        }catch(e){
          console.error("admin members address fallback",e);
          rows=await sql`SELECT * FROM members ORDER BY registered_at DESC`;
          rows=rows.map(r=>({...r,address_line:null,subdistrict:null,district:null,province:null,postal_code:null}));
        }
        return json(request,{success:true,data:rows.map(x=>({...x,status:memberStatusText(x.status)}))});
      }
      if(/^\/api\/admin\/members\/[^/]+\/overview$/.test(path)&&request.method==="GET"){
        const denied=await requireAdmin(request,env,sql);if(denied)return denied;await ensureMemberAdminSchema(sql);
        const code=decodeURIComponent(path.split('/')[4]).toUpperCase();
        const mr=await sql`SELECT m.*,a.address_line,a.subdistrict,a.district,a.province,a.postal_code FROM members m LEFT JOIN addresses a ON a.member_code=m.member_code WHERE m.member_code=${code} LIMIT 1`;
        if(!mr.length)return json(request,{success:false,message:"ไม่พบสมาชิก"},404);
        const payments=await sql`SELECT payment_id,payment_type,amount,status,paid_at,verified_at,receipt_no FROM payments WHERE member_code=${code} ORDER BY paid_at DESC,created_at DESC LIMIT 500`;
        const donations=await sql`SELECT d.donation_id,d.topic_id,COALESCE(dt.title,d.topic_id) AS topic_title,d.amount,d.status,d.donated_at FROM donations d LEFT JOIN donation_topics dt ON dt.topic_id=d.topic_id WHERE d.member_code=${code} ORDER BY d.donated_at DESC,d.created_at DESC LIMIT 500`;
        let usages=[];try{const ex=await sql`SELECT to_regclass('public.benefit_usage') AS t`;if(ex[0]?.t)usages=await sql`SELECT u.usage_id,u.used_at,u.amount,u.note,u.benefit_id,COALESCE(b.title,u.benefit_id) AS title,('USE-'||u.usage_id) AS reference_no FROM benefit_usage u LEFT JOIN benefits b ON b.benefit_id=u.benefit_id WHERE u.member_code=${code} ORDER BY u.used_at DESC,u.created_at DESC LIMIT 500`}catch(e){}
        const logs=await sql`SELECT log_id,action,detail,admin_by,created_at FROM member_admin_logs WHERE member_code=${code} ORDER BY created_at DESC LIMIT 300`;
        const memberCardToken=await cardToken(code,env);return json(request,{success:true,data:{member:{...mr[0],status:memberStatusText(mr[0].status)},payments,donations,benefit_usage:usages,logs,card_token:memberCardToken}});
      }
      if(/^\/api\/admin\/members\/[^/]+\/logs$/.test(path)&&request.method==="GET"){
        const denied=await requireAdmin(request,env,sql);if(denied)return denied;await ensureMemberAdminSchema(sql);const code=decodeURIComponent(path.split('/')[4]).toUpperCase();
        const rows=await sql`SELECT log_id,member_code,action,detail,admin_by,created_at FROM member_admin_logs WHERE member_code=${code} ORDER BY created_at DESC LIMIT 500`;return json(request,{success:true,data:rows});
      }
      if(/^\/api\/admin\/members\/[^/]+$/.test(path)){
        const denied=await requireAdmin(request,env,sql);if(denied)return denied;const code=decodeURIComponent(path.split('/').pop()).toUpperCase();
        if(request.method==="GET"){
          const rows=await sql`SELECT m.*,a.address_line,a.subdistrict,a.district,a.province,a.postal_code FROM members m LEFT JOIN addresses a ON a.member_code=m.member_code WHERE m.member_code=${code} LIMIT 1`;if(!rows.length)return json(request,{success:false,message:"ไม่พบสมาชิก"},404);return json(request,{success:true,data:{...rows[0],status:memberStatusText(rows[0].status)}});
        }
        if(request.method==="DELETE"){
          await ensureMemberAdminSchema(sql);const before=await sql`SELECT member_code,full_name,email,phone,status FROM members WHERE member_code=${code} LIMIT 1`;if(!before.length)return json(request,{success:false,message:"ไม่พบสมาชิก"},404);
          const pc=await sql`SELECT COUNT(*)::int n FROM payments WHERE member_code=${code}`,dc=await sql`SELECT COUNT(*)::int n FROM donations WHERE member_code=${code}`;let bc=[{n:0}];try{const ex=await sql`SELECT to_regclass('public.benefit_usage') AS t`;if(ex[0]?.t)bc=await sql`SELECT COUNT(*)::int n FROM benefit_usage WHERE member_code=${code}`}catch(e){}
          const history={payments:Number(pc[0]?.n||0),donations:Number(dc[0]?.n||0),benefits:Number(bc[0]?.n||0)};if(history.payments||history.donations||history.benefits)return json(request,{success:false,code:'MEMBER_HAS_HISTORY',message:'สมาชิกมีประวัติชำระ บริจาค หรือการใช้สิทธิ์ จึงลบไม่ได้ ให้เปลี่ยนสถานะเป็นยกเลิก/ไม่อนุมัติแทน',history},409);
          try{await sql.begin(async tx=>{try{await tx`DELETE FROM member_edit_history WHERE member_code=${code}`}catch(e){}await tx`DELETE FROM addresses WHERE member_code=${code}`;await tx`DELETE FROM members WHERE member_code=${code}`;await tx`INSERT INTO member_admin_logs(log_id,member_code,action,detail,old_data,new_data,admin_by,created_at) VALUES(${id('MLOG')},${code},'delete','ลบสมาชิกที่ไม่มีประวัติทางบัญชีหรือการใช้สิทธิ์',CAST(${JSON.stringify(before[0])} AS JSONB),NULL,${await currentAdminLabel(request,env,sql)},NOW())`;})}catch(e){return json(request,{success:false,message:"ลบข้อมูลไม่สำเร็จ: "+String(e?.message||e)},500)}
          return json(request,{success:true,message:"ลบสมาชิกแล้ว"});
        }
        if(request.method==="PUT"||request.method==="PATCH"){
          await ensureMemberAdminSchema(sql);const b=await body(request),beforeRows=await sql`SELECT m.*,a.address_line,a.subdistrict,a.district,a.province,a.postal_code FROM members m LEFT JOIN addresses a ON a.member_code=m.member_code WHERE m.member_code=${code} LIMIT 1`;if(!beforeRows.length)return json(request,{success:false,message:"ไม่พบสมาชิก"},404);
          if(Object.prototype.hasOwnProperty.call(b,'photo_data')&&b.photo_data&&!photoOK(b.photo_data))return json(request,{success:false,message:"รูปสมาชิกต้องเป็น JPG/WEBP และขนาดไม่เกินที่ระบบกำหนด"},400);
          const full=[clean(b.first_name),clean(b.last_name)].filter(Boolean).join(' ')||clean(b.full_name),hasPhoto=Object.prototype.hasOwnProperty.call(b,'photo_data'),unlinkLine=!!b.unlink_line;
          await sql.begin(async tx=>{
            if(unlinkLine)await tx`UPDATE line_users SET member_code=NULL,updated_at=NOW() WHERE member_code=${code}`;
            await tx`UPDATE members SET prefix=COALESCE(NULLIF(${clean(b.prefix)},''),prefix),first_name=COALESCE(NULLIF(${clean(b.first_name)},''),first_name),last_name=COALESCE(NULLIF(${clean(b.last_name)},''),last_name),full_name=COALESCE(NULLIF(${full},''),full_name),arabic_name=${clean(b.arabic_name)||null},phone=COALESCE(NULLIF(${clean(b.phone)},''),phone),email=${clean(b.email)||null},line_id=${clean(b.line_id)||null},line_user_id=CASE WHEN ${unlinkLine} THEN NULL ELSE line_user_id END,photo_data=CASE WHEN ${hasPhoto} THEN ${clean(b.photo_data)||null} ELSE photo_data END,status=COALESCE(NULLIF(${clean(b.status)},''),status),updated_at=NOW() WHERE member_code=${code}`;
            await tx`INSERT INTO addresses(member_code,address_line,subdistrict,district,province,postal_code,updated_at) VALUES(${code},${clean(b.address_line)||null},${clean(b.subdistrict)||null},${clean(b.district)||null},${clean(b.province)||null},${clean(b.postal_code)||null},NOW()) ON CONFLICT(member_code) DO UPDATE SET address_line=EXCLUDED.address_line,subdistrict=EXCLUDED.subdistrict,district=EXCLUDED.district,province=EXCLUDED.province,postal_code=EXCLUDED.postal_code,updated_at=NOW()`;
            const after={...b,full_name:full};await tx`INSERT INTO member_admin_logs(log_id,member_code,action,detail,old_data,new_data,admin_by,created_at) VALUES(${id('MLOG')},${code},'edit','แก้ไขข้อมูลสมาชิก',CAST(${JSON.stringify(beforeRows[0])} AS JSONB),CAST(${JSON.stringify(after)} AS JSONB),${await currentAdminLabel(request,env,sql)},NOW())`;
          });
          return json(request,{success:true,message:"บันทึกแล้ว"});
        }
      }
      if(/^\/api\/admin\/members\/[^/]+\/status$/.test(path)&&request.method==="PATCH"){
        const denied=await requireAdmin(request,env,sql);if(denied)return denied;await ensureMemberAdminSchema(sql);const code=decodeURIComponent(path.split('/')[4]).toUpperCase(),b=await body(request),st=memberStatusText(b.status),reason=clean(b.reason);const old=await sql`SELECT status FROM members WHERE member_code=${code} LIMIT 1`;if(!old.length)return json(request,{success:false,message:"ไม่พบสมาชิก"},404);
        const stored=st==='cancelled'&&reason?`ไม่อนุมัติ (${reason})`:st;
        await sql.begin(async tx=>{await tx`UPDATE members SET status=${stored},member_start=CASE WHEN ${st}='active' AND member_start IS NULL THEN NOW() ELSE member_start END,member_expire=CASE WHEN ${st}='active' AND member_expire IS NULL THEN NOW()+INTERVAL '1 year' ELSE member_expire END,updated_at=NOW() WHERE member_code=${code}`;await tx`INSERT INTO member_admin_logs(log_id,member_code,action,detail,old_data,new_data,admin_by,created_at) VALUES(${id('MLOG')},${code},'status',${st==='cancelled'&&reason?'ไม่อนุมัติ: '+reason:'เปลี่ยนสถานะเป็น '+st},CAST(${JSON.stringify(old[0])} AS JSONB),CAST(${JSON.stringify({status:stored,reason})} AS JSONB),${await currentAdminLabel(request,env,sql)},NOW())`});const when=lineDateTime();const statusMsg=st==='active'?`✅ สมาชิก ${code} ได้รับการอนุมัติแล้ว\nเมื่อ ${when}\n\nพิมพ์ “ข้อมูลของฉัน” เพื่อเปิดข้อมูลสมาชิกและบัตรสมาชิกได้เลยค่ะ`:st==='cancelled'?`แจ้งสถานะสมาชิก ${code}: ไม่อนุมัติ\nเมื่อ ${when}${reason?'\nเหตุผล: '+reason:''}`:`แจ้งสถานะสมาชิก ${code}: ${stored}\nเมื่อ ${when}`;await notifyLinkedMember(sql,env,code,statusMsg);return json(request,{success:true,status:stored});
      }

      if(path==="/api/admin/payment-topics"){
        const denied=await requireAdmin(request,env,sql);if(denied)return denied;await ensureV2616Schema(sql);
        if(request.method==="GET"){const rows=await sql`SELECT topic_id,title,description,amount,active,created_at,updated_at FROM payment_topics ORDER BY created_at,title`;return json(request,{success:true,data:rows})}
        if(request.method==="POST"){
          const b=await body(request),title=clean(b.title),amount=b.amount===''||b.amount==null?null:Number(b.amount);if(!title)return json(request,{success:false,message:"กรุณากรอกหัวข้อรายการ"},400);if(amount!=null&&(!Number.isFinite(amount)||amount<0))return json(request,{success:false,message:"ยอดเงินไม่ถูกต้อง"},400);
          const tid=clean(b.topic_id)||id('TOPIC');await sql`INSERT INTO payment_topics(topic_id,title,description,amount,active,created_at,updated_at) VALUES(${tid},${title},${clean(b.description)||null},${amount},${b.active!==false},NOW(),NOW()) ON CONFLICT(topic_id) DO UPDATE SET title=EXCLUDED.title,description=EXCLUDED.description,amount=EXCLUDED.amount,active=EXCLUDED.active,updated_at=NOW()`;return json(request,{success:true,topic_id:tid,message:"บันทึกหัวข้อการชำระแล้ว"},201)
        }
      }
      if(/^\/api\/admin\/payment-topics\/[^/]+$/.test(path)&&request.method==="DELETE"){
        const denied=await requireAdmin(request,env,sql);if(denied)return denied;const tid=decodeURIComponent(path.split('/').pop());if(url.searchParams.get('hard')==='1'){if(tid==='membership')return json(request,{success:false,message:'หัวข้อค่าบำรุงหลักไม่สามารถลบได้ ให้แก้ไขหรือปิดใช้งานแทน'},409);const c=await sql`SELECT COUNT(*)::int n FROM payments WHERE topic_id=${tid}`;if(Number(c[0]?.n||0)>0)return json(request,{success:false,message:'หัวข้อนี้มีประวัติการชำระอ้างอิงอยู่ จึงลบไม่ได้ ให้ปิดใช้งานแทน'},409);await sql`DELETE FROM payment_topics WHERE topic_id=${tid}`;return json(request,{success:true,message:'ลบหัวข้อแล้ว'})}await sql`UPDATE payment_topics SET active=FALSE,updated_at=NOW() WHERE topic_id=${tid}`;return json(request,{success:true,message:"ปิดใช้งานหัวข้อแล้ว"});
      }

      if(path==="/api/admin/donation-topics"){
        const denied=await requireAdmin(request,env,sql);if(denied)return denied;
        if(request.method==="GET"){const rows=await sql`SELECT topic_id,title,description,active,created_at,updated_at FROM donation_topics ORDER BY created_at,title`;return json(request,{success:true,data:rows})}
        if(request.method==="POST"){
          const b=await body(request),title=clean(b.title);if(!title)return json(request,{success:false,message:"กรุณากรอกหัวข้อการบริจาค"},400);
          const tid=clean(b.topic_id)||id('DTOPIC');
          await sql`INSERT INTO donation_topics(topic_id,title,description,active,created_at,updated_at) VALUES(${tid},${title},${clean(b.description)||null},${b.active!==false},NOW(),NOW()) ON CONFLICT(topic_id) DO UPDATE SET title=EXCLUDED.title,description=EXCLUDED.description,active=EXCLUDED.active,updated_at=NOW()`;
          return json(request,{success:true,topic_id:tid,message:"บันทึกหัวข้อบริจาคแล้ว"},201)
        }
      }
      if(/^\/api\/admin\/donation-topics\/[^/]+$/.test(path)&&request.method==="DELETE"){
        const denied=await requireAdmin(request,env,sql);if(denied)return denied;const tid=decodeURIComponent(path.split('/').pop());if(url.searchParams.get('hard')==='1'){const c=await sql`SELECT COUNT(*)::int n FROM donations WHERE topic_id=${tid}`;if(Number(c[0]?.n||0)>0)return json(request,{success:false,message:'หัวข้อนี้มีประวัติการสนับสนุนอ้างอิงอยู่ จึงลบไม่ได้ ให้ปิดใช้งานแทน'},409);await sql`DELETE FROM donation_topics WHERE topic_id=${tid}`;return json(request,{success:true,message:'ลบหัวข้อแล้ว'})}await sql`UPDATE donation_topics SET active=FALSE,updated_at=NOW() WHERE topic_id=${tid}`;return json(request,{success:true,message:"ปิดใช้งานหัวข้อบริจาคแล้ว"});
      }
      if(/^\/api\/admin\/payments\/[^/]+\/verify$/.test(path)&&request.method==="PATCH"){
        const denied=await requireAdmin(request,env,sql);if(denied)return denied;const paymentId=decodeURIComponent(path.split('/')[4]),b=await body(request),approve=String(b.action||'approve').toLowerCase()==='approve',admin=await currentAdminLabel(request,env,sql);
        await sql`ALTER TABLE payments ADD COLUMN IF NOT EXISTS receipt_no TEXT`;
        await sql`ALTER TABLE payments ADD COLUMN IF NOT EXISTS receipt_issued_at TIMESTAMPTZ`;
        const rows=await sql`SELECT payment_id,member_code,payment_type,amount,status,paid_at,slip_data FROM payments WHERE payment_id=${paymentId} LIMIT 1`;if(!rows.length)return json(request,{success:false,message:"ไม่พบรายการชำระ"},404);const pay=rows[0];
        if(pay.status==='ชำระแล้ว')return json(request,{success:true,message:"รายการนี้ยืนยันแล้ว"});
        if(!approve){await sql`UPDATE payments SET status='ไม่อนุมัติ',verified_by=${admin},verified_at=NOW(),note=COALESCE(NULLIF(${clean(b.note)},''),note),updated_at=NOW() WHERE payment_id=${paymentId}`;await notifyLinkedMember(sql,env,pay.member_code,`⚠️ รายการแจ้งชำระไม่ผ่านการตรวจสอบ\nเมื่อ ${lineDateTime()}${clean(b.note)?'\nเหตุผล: '+clean(b.note):''}\nกรุณาตรวจสอบข้อมูลและแจ้งใหม่`);return json(request,{success:true,message:"บันทึกไม่อนุมัติแล้ว"})}
        await ensureReceiptOpsSchema(sql);let officialReceipt=null;
        try{await sql.begin(async tx=>{
          const cur=await tx`SELECT receipt_no FROM payments WHERE payment_id=${paymentId} LIMIT 1 FOR UPDATE`;officialReceipt=cur[0]?.receipt_no||null;if(!officialReceipt)officialReceipt=await allocateReceiptNumber(tx);
          await tx`UPDATE payments SET status='ชำระแล้ว',verified_by=${admin},verified_at=NOW(),receipt_no=COALESCE(receipt_no,${officialReceipt}),receipt_issued_at=COALESCE(receipt_issued_at,NOW()),note=COALESCE(NULLIF(${clean(b.note)},''),note),updated_at=NOW() WHERE payment_id=${paymentId}`;
          await tx`UPDATE members SET status='active',member_start=COALESCE(member_start,NOW()),member_expire=(CASE WHEN member_expire IS NULL OR member_expire<NOW() THEN NOW() ELSE member_expire END)+INTERVAL '1 year',updated_at=NOW() WHERE member_code=${pay.member_code}`;
          await tx`INSERT INTO ledger_entries(entry_id,entry_date,entry_type,category,source,amount,reference_type,reference_id,member_code,description,note,created_by,status,created_at,updated_at,attachment_data,attachment_name,attachment_type)
            SELECT ${id('LED')},NOW(),'รายรับ','ค่าสมาชิก',${pay.payment_type},${pay.amount},'payment',${pay.payment_id},${pay.member_code},${'รับค่าบำรุงสมาคมศิษย์เก่าฯ รายปี '+pay.member_code},${clean(b.note)||null},${admin},'posted',NOW(),NOW(),${pay.slip_data||null},${pay.slip_data?'หลักฐานการโอน '+pay.payment_id:null},${pay.slip_data?(String(pay.slip_data).startsWith('data:application/pdf')?'application/pdf':'image/*'):null}
            WHERE NOT EXISTS (SELECT 1 FROM ledger_entries WHERE reference_type='payment' AND reference_id=${pay.payment_id} AND entry_type='รายรับ')`;
        });}catch(e){return json(request,{success:false,code:'RECEIPT_BOOK_REQUIRED',message:String(e?.message||e)},409)}
        await notifyLinkedMember(sql,env,pay.member_code,`✅ ได้รับค่าสมาชิกแล้ว\nสมาชิก: ${pay.member_code}\nจำนวน ${Number(pay.amount||0).toLocaleString('th-TH')} บาท\nยืนยันเมื่อ ${lineDateTime()}\nเลขที่ใบเสร็จ: ${officialReceipt||'-'}\n\nพิมพ์ “ประวัติชำระ” เพื่อดูรายละเอียด`);return json(request,{success:true,message:"ยืนยันการชำระแล้ว ต่ออายุสมาชิก 1 ปี และลงบัญชีรายรับเรียบร้อย",receipt_no:officialReceipt});
      }

      if(/^\/api\/admin\/payments\/[^/]+\/receipt$/.test(path)&&request.method==="GET"){
        const denied=await requireAdmin(request,env,sql);if(denied)return denied;
        const paymentId=decodeURIComponent(path.split('/')[4]);
        await sql`ALTER TABLE payments ADD COLUMN IF NOT EXISTS receipt_no TEXT`;
        await sql`ALTER TABLE payments ADD COLUMN IF NOT EXISTS receipt_issued_at TIMESTAMPTZ`;
        /* V2.6.82: do not fabricate receipt numbers; official numbers come from receipt books. */
        const rows=await sql`SELECT p.payment_id,p.member_code,p.payment_type,p.amount,p.paid_at,p.status,p.verified_by,p.verified_at,p.receipt_no,p.receipt_issued_at,m.prefix,m.first_name,m.last_name,m.full_name,m.phone,m.email,a.address_line,a.subdistrict,a.district,a.province,a.postal_code FROM payments p LEFT JOIN members m ON m.member_code=p.member_code LEFT JOIN addresses a ON a.member_code=p.member_code WHERE p.payment_id=${paymentId} LIMIT 1`;
        if(!rows.length)return json(request,{success:false,message:"ไม่พบรายการชำระ"},404);
        if(rows[0].status!=="ชำระแล้ว")return json(request,{success:false,message:"ออกใบเสร็จได้เมื่อรายการได้รับอนุมัติแล้ว"},409);
        const st=await sql`SELECT setting_key,setting_value FROM app_settings WHERE setting_key IN ('APP_NAME','CONTACT_EMAIL','BANK_ACCOUNT_NAME','BANK_NAME','BANK_ACCOUNT_NO','ASSOCIATION_ADDRESS','ASSOCIATION_STAMP','HOME_QUOTE','HOME_QUOTE_BY','HOME_NEWS_TITLE')`;
        const settings={};for(const r of st)settings[r.setting_key]=r.setting_value;
        return json(request,{success:true,data:{...rows[0],source_type:'payment',transaction_id:paymentId,settings}})
      }

      if(path==="/api/admin/payments"&&request.method==="GET"){
        const denied=await requireAdmin(request,env,sql);if(denied)return denied;
        await sql`ALTER TABLE payments ADD COLUMN IF NOT EXISTS slip_data TEXT`;
        await sql`ALTER TABLE payments ADD COLUMN IF NOT EXISTS receipt_no TEXT`;
        await sql`ALTER TABLE payments ADD COLUMN IF NOT EXISTS receipt_issued_at TIMESTAMPTZ`;
        /* V2.6.82: do not fabricate receipt numbers; official numbers come from receipt books. */
        const rows=await sql`SELECT p.*,m.full_name,m.prefix,m.first_name,m.last_name,m.email AS member_email,m.phone AS member_phone FROM payments p LEFT JOIN members m ON m.member_code=p.member_code ORDER BY p.created_at DESC LIMIT 1000`;
        return json(request,{success:true,data:rows})
      }
      if(path==="/api/admin/donations"&&request.method==="GET"){
        const denied=await requireAdmin(request,env,sql);if(denied)return denied;await ensureV2616Schema(sql);
        await sql`ALTER TABLE donations ADD COLUMN IF NOT EXISTS slip_data TEXT`;
        const rows=await sql`SELECT d.*,dt.title AS topic_title,m.full_name AS member_full_name FROM donations d LEFT JOIN donation_topics dt ON dt.topic_id=d.topic_id LEFT JOIN members m ON m.member_code=d.member_code ORDER BY d.created_at DESC LIMIT 1000`;
        return json(request,{success:true,data:rows})
      }
      if(path==="/api/admin/receipts"&&request.method==="GET"){
        const denied=await requireAdmin(request,env,sql);if(denied)return denied;await ensureV2616Schema(sql);
        /* V2.6.82: do not fabricate receipt numbers; official numbers come from receipt books. */
        /* V2.6.82: official donation receipt numbers come from receipt books. */
        const rows=await sql`SELECT * FROM (SELECT 'payment'::text AS source_type,p.payment_id AS transaction_id,p.receipt_no,p.receipt_issued_at,p.member_code,p.payment_type AS receipt_type,p.amount,p.paid_at AS transferred_at,p.verified_by,p.verified_at,m.prefix,m.first_name,m.last_name,m.full_name,m.phone,m.email FROM payments p LEFT JOIN members m ON m.member_code=p.member_code WHERE p.status='ชำระแล้ว' UNION ALL SELECT 'donation'::text AS source_type,d.donation_id AS transaction_id,d.receipt_no,d.receipt_issued_at,d.member_code,COALESCE(dt.title,'เงินบริจาค') AS receipt_type,d.amount,d.donated_at AS transferred_at,d.verified_by,d.verified_at,m.prefix,m.first_name,m.last_name,COALESCE(m.full_name,d.donor_name) AS full_name,COALESCE(m.phone,d.phone) AS phone,COALESCE(m.email,d.email) AS email FROM donations d LEFT JOIN donation_topics dt ON dt.topic_id=d.topic_id LEFT JOIN members m ON m.member_code=d.member_code WHERE d.status IN ('ตรวจสอบแล้ว','อนุมัติ','approved','verified')) q ORDER BY receipt_issued_at DESC LIMIT 4000`;
        return json(request,{success:true,data:rows});
      }

      if(path==="/api/admin/receipt-books"&&request.method==="GET"){
        const denied=await requireAdmin(request,env,sql);if(denied)return denied;await ensureReceiptOpsSchema(sql);const rows=await sql`SELECT *,GREATEST(0,next_no-start_no) AS used_count FROM receipt_books ORDER BY book_year DESC,book_no DESC`;return json(request,{success:true,data:rows});
      }
      if(path==="/api/admin/receipt-books"&&request.method==="POST"){
        const denied=await requireAdmin(request,env,sql);if(denied)return denied;await ensureReceiptOpsSchema(sql);const b=await body(request),year=Number(b.year),bookNo=Number(b.book_no);if(!year||!bookNo)return json(request,{success:false,message:'กรุณาระบุปี พ.ศ. และเล่มที่'},400);const code=`${year}${String(bookNo).padStart(2,'0')}`;try{await sql`INSERT INTO receipt_books(book_id,book_year,book_no,book_code,start_no,end_no,next_no,status,created_by,created_at) VALUES(${id('RBK')},${year},${bookNo},${code},1,100,1,'open','admin',NOW())`;return json(request,{success:true,book_code:code},201)}catch(e){return json(request,{success:false,message:'ปีและเล่มนี้มีอยู่แล้ว'},409)}
      }
      if(path==="/api/admin/remittance/available"&&request.method==="GET"){
        const denied=await requireAdmin(request,env,sql);if(denied)return denied;await ensureReceiptOpsSchema(sql);await ensureV2616Schema(sql);const rows=await sql`SELECT * FROM (SELECT 'payment'::text source_type,p.payment_id transaction_id,p.receipt_no,p.receipt_issued_at,p.member_code,p.payment_type receipt_type,p.amount,m.prefix,m.first_name,m.last_name,m.full_name FROM payments p LEFT JOIN members m ON m.member_code=p.member_code WHERE p.status='ชำระแล้ว' UNION ALL SELECT 'donation'::text,d.donation_id,d.receipt_no,d.receipt_issued_at,d.member_code,COALESCE(dt.title,'เงินบริจาค'),d.amount,m.prefix,m.first_name,m.last_name,COALESCE(m.full_name,d.donor_name) FROM donations d LEFT JOIN donation_topics dt ON dt.topic_id=d.topic_id LEFT JOIN members m ON m.member_code=d.member_code WHERE d.status IN ('ตรวจสอบแล้ว','อนุมัติ','approved','verified')) q WHERE receipt_no IS NOT NULL AND NOT EXISTS (SELECT 1 FROM remittance_items ri JOIN remittance_reports rr ON rr.report_id=ri.report_id WHERE ri.source_type=q.source_type AND ri.transaction_id=q.transaction_id AND rr.status='active') ORDER BY receipt_issued_at,receipt_no`;return json(request,{success:true,data:rows});
      }
      if(path==="/api/admin/remittance-reports"&&request.method==="GET"){
        const denied=await requireAdmin(request,env,sql);if(denied)return denied;await ensureReceiptOpsSchema(sql);const rows=await sql`SELECT r.*,COUNT(i.item_id)::int item_count,COALESCE(SUM(i.amount),0) total_amount,COALESCE(SUM(i.amount) FILTER(WHERE i.source_type='payment'),0) payment_total,COALESCE(SUM(i.amount) FILTER(WHERE i.source_type='donation'),0) donation_total FROM remittance_reports r LEFT JOIN remittance_items i ON i.report_id=r.report_id GROUP BY r.report_id ORDER BY r.created_at DESC`;return json(request,{success:true,data:rows});
      }
      if(path==="/api/admin/remittance-reports"&&request.method==="POST"){
        const denied=await requireAdmin(request,env,sql);if(denied)return denied;
        await ensureReceiptOpsSchema(sql);
        const b=await body(request),items=Array.isArray(b.items)?b.items:[];
        if(!items.length)return json(request,{success:false,message:'กรุณาเลือกใบเสร็จ'},400);
        const rid=id('RMT'),y=new Date().getFullYear()+543;
        const c=await sql`SELECT COUNT(*)::int n FROM remittance_reports WHERE EXTRACT(YEAR FROM report_date)=EXTRACT(YEAR FROM NOW())`;
        const rno=`RMT-${y}-${String(Number(c[0]?.n||0)+1).padStart(4,'0')}`;
        try{
          await sql.begin(async tx=>{
            await tx`INSERT INTO remittance_reports(report_id,report_no,report_date,note,status,created_by,created_at) VALUES(${rid},${rno},NOW(),${clean(b.note)||null},'active','admin',NOW())`;
            for(const it of items){
              const st=clean(it.source_type)==='donation'?'donation':'payment',tid=clean(it.transaction_id);
              let rows=[];
              if(st==='payment') rows=await tx`SELECT receipt_no,amount,payment_type receipt_type FROM payments WHERE payment_id=${tid} AND status='ชำระแล้ว' LIMIT 1`;
              else rows=await tx`SELECT d.receipt_no,d.amount,COALESCE(dt.title,'เงินบริจาค') receipt_type FROM donations d LEFT JOIN donation_topics dt ON dt.topic_id=d.topic_id WHERE d.donation_id=${tid} AND d.status IN ('ตรวจสอบแล้ว','อนุมัติ','approved','verified') LIMIT 1`;
              if(!rows.length||!rows[0].receipt_no)throw new Error('พบรายการใบเสร็จไม่พร้อมนำส่ง');
              const used=await tx`SELECT 1 FROM remittance_items ri JOIN remittance_reports rr ON rr.report_id=ri.report_id WHERE ri.source_type=${st} AND ri.transaction_id=${tid} AND rr.status='active' LIMIT 1`;
              if(used.length)throw new Error('มีใบเสร็จบางรายการถูกนำส่งในรายงานที่ยังใช้งานอยู่แล้ว');
              await tx`INSERT INTO remittance_items(item_id,report_id,source_type,transaction_id,receipt_no,amount,receipt_type,created_at) VALUES(${id('RMI')},${rid},${st},${tid},${rows[0].receipt_no},${rows[0].amount},${rows[0].receipt_type},NOW())`;
            }
            await tx`INSERT INTO remittance_logs(log_id,report_id,action,detail,admin_by,created_at) VALUES(${id('RLOG')},${rid},'create',${'สร้างรายงาน '+rno+' จำนวน '+items.length+' ใบ'},'admin',NOW())`;
          });
          return json(request,{success:true,report_id:rid,report_no:rno},201)
        }catch(e){return json(request,{success:false,message:'สร้างรายงานไม่ได้: '+String(e?.message||e)},409)}
      }
      if(/^\/api\/admin\/remittance-reports\/[^/]+\/cancel$/.test(path)&&request.method==="PATCH"){
        const denied=await requireAdmin(request,env,sql);if(denied)return denied;await ensureReceiptOpsSchema(sql);const rid=decodeURIComponent(path.split('/')[4]);await sql`UPDATE remittance_reports SET status='cancelled',cancelled_at=NOW(),cancelled_by=${await currentAdminLabel(request,env,sql)} WHERE report_id=${rid} AND status='active'`;await sql`INSERT INTO remittance_logs(log_id,report_id,action,detail,admin_by,created_at) VALUES(${id('RLOG')},${rid},'cancel','ยกเลิกรายงานนำส่งเงิน',${await currentAdminLabel(request,env,sql)},NOW())`;return json(request,{success:true});
      }

      if(/^\/api\/admin\/remittance-reports\/[^/]+$/.test(path)&&request.method==="GET"){
        const denied=await requireAdmin(request,env,sql);if(denied)return denied;await ensureReceiptOpsSchema(sql);const rid=decodeURIComponent(path.split('/').pop());
        const rr=await sql`SELECT * FROM remittance_reports WHERE report_id=${rid} LIMIT 1`;if(!rr.length)return json(request,{success:false,message:'ไม่พบรายงานนำส่งเงิน'},404);
        const items=await sql`SELECT i.*,COALESCE(m.full_name,TRIM(CONCAT_WS(' ',m.prefix,m.first_name,m.last_name)),d.donor_name,'-') AS payer_name FROM remittance_items i LEFT JOIN payments p ON i.source_type='payment' AND p.payment_id=i.transaction_id LEFT JOIN donations d ON i.source_type='donation' AND d.donation_id=i.transaction_id LEFT JOIN members m ON m.member_code=COALESCE(p.member_code,d.member_code) WHERE i.report_id=${rid} ORDER BY i.receipt_no,i.created_at`;
        const st=await sql`SELECT setting_key,setting_value FROM app_settings WHERE setting_key IN ('APP_NAME','ASSOCIATION_ADDRESS','CONTACT_EMAIL')`;const settings={};for(const r of st)settings[r.setting_key]=r.setting_value;
        return json(request,{success:true,data:{report:rr[0],items,settings}});
      }
      if(path==="/api/admin/remittance-logs"&&request.method==="GET"){
        const denied=await requireAdmin(request,env,sql);if(denied)return denied;await ensureReceiptOpsSchema(sql);const rows=await sql`SELECT l.*,r.report_no FROM remittance_logs l LEFT JOIN remittance_reports r ON r.report_id=l.report_id ORDER BY l.created_at DESC LIMIT 2000`;return json(request,{success:true,data:rows});
      }
      if(/^\/api\/admin\/remittance-reports\/[^/]+\/print-log$/.test(path)&&request.method==="POST"){
        const denied=await requireAdmin(request,env,sql);if(denied)return denied;await ensureReceiptOpsSchema(sql);const rid=decodeURIComponent(path.split('/')[4]);const rr=await sql`SELECT report_no FROM remittance_reports WHERE report_id=${rid} LIMIT 1`;if(!rr.length)return json(request,{success:false,message:'ไม่พบรายงานนำส่งเงิน'},404);await sql`INSERT INTO remittance_logs(log_id,report_id,action,detail,admin_by,created_at) VALUES(${id('RLOG')},${rid},'print',${'พิมพ์รายงาน '+rr[0].report_no},${await currentAdminLabel(request,env,sql)},NOW())`;return json(request,{success:true});
      }
      if(path==="/api/admin/receipt-print-logs"&&request.method==="GET"){
        const denied=await requireAdmin(request,env,sql);if(denied)return denied;await ensureV2616Schema(sql);
        const rows=await sql`SELECT * FROM receipt_print_logs ORDER BY printed_at DESC LIMIT 5000`;
        return json(request,{success:true,data:rows});
      }
      if(path==="/api/admin/receipt-print-logs"&&request.method==="POST"){
        const denied=await requireAdmin(request,env,sql);if(denied)return denied;await ensureV2616Schema(sql);const b=await body(request);let items=Array.isArray(b.items)?b.items.slice(0,500):[];if(!items.length&&Array.isArray(b.payment_ids))items=b.payment_ids.map(x=>({source_type:'payment',transaction_id:x}));if(!items.length)return json(request,{success:false,message:'ไม่พบรายการใบเสร็จที่จะบันทึกประวัติพิมพ์'},400);const batch=clean(b.batch_id)||id('BATCH'),ptype=clean(b.print_type)||'single',who=await currentAdminLabel(request,env,sql),ua=clean(b.user_agent).slice(0,500);
        for(const it of items){const st=clean(it.source_type)==='donation'?'donation':'payment',tid=clean(it.transaction_id);if(!tid)continue;let rr=[];if(st==='donation')rr=await sql`SELECT receipt_no FROM donations WHERE donation_id=${tid} AND status IN ('ตรวจสอบแล้ว','อนุมัติ','approved','verified') LIMIT 1`;else rr=await sql`SELECT receipt_no FROM payments WHERE payment_id=${tid} AND status='ชำระแล้ว' LIMIT 1`;if(!rr.length)continue;await sql`INSERT INTO receipt_print_logs(log_id,batch_id,payment_id,receipt_no,print_type,printed_by,printed_at,user_agent,source_type,transaction_id) VALUES(${id('PRN')},${batch},${tid},${rr[0].receipt_no||null},${ptype},${who},NOW(),${ua||null},${st},${tid})`}
        return json(request,{success:true,batch_id:batch,message:'บันทึกประวัติการพิมพ์แล้ว'},201)
      }

      if(/^\/api\/admin\/donations\/[^/]+\/verify$/.test(path)&&request.method==="PATCH"){
        const denied=await requireAdmin(request,env,sql);if(denied)return denied;
        await ensureV2616Schema(sql);const donationId=decodeURIComponent(path.split('/')[4]),b=await body(request),approve=String(b.action||'approve').toLowerCase()==='approve',admin=await currentAdminLabel(request,env,sql);
        const rows=await sql`SELECT d.donation_id,d.member_code,d.topic_id,d.amount,d.status,d.donated_at,d.donor_name,d.slip_data,dt.title AS topic_title FROM donations d LEFT JOIN donation_topics dt ON dt.topic_id=d.topic_id WHERE d.donation_id=${donationId} LIMIT 1`;
        if(!rows.length)return json(request,{success:false,message:"ไม่พบรายการบริจาค"},404);
        const don=rows[0],done=["ตรวจสอบแล้ว","อนุมัติ","approved","verified"].includes(String(don.status||"").toLowerCase());
        if(done)return json(request,{success:true,message:"รายการนี้ตรวจสอบแล้ว"});
        if(!approve){
          await sql`UPDATE donations SET status='ไม่อนุมัติ',verified_by=${admin},verified_at=NOW(),note=COALESCE(NULLIF(${clean(b.note)},''),note),updated_at=NOW() WHERE donation_id=${donationId}`;
          if(don.member_code)await notifyLinkedMember(sql,env,don.member_code,`⚠️ รายการบริจาคไม่ผ่านการตรวจสอบ\nเมื่อ ${lineDateTime()}${clean(b.note)?'\nเหตุผล: '+clean(b.note):''}\nกรุณาตรวจสอบข้อมูลและแจ้งใหม่`);
          return json(request,{success:true,message:"บันทึกไม่อนุมัติแล้ว"})
        }
        await ensureReceiptOpsSchema(sql);let officialReceipt=null;
        try{await sql.begin(async tx=>{
          const cur=await tx`SELECT receipt_no FROM donations WHERE donation_id=${donationId} LIMIT 1 FOR UPDATE`;officialReceipt=cur[0]?.receipt_no||null;if(!officialReceipt)officialReceipt=await allocateReceiptNumber(tx);
          await tx`UPDATE donations SET status='ตรวจสอบแล้ว',verified_by=${admin},verified_at=NOW(),receipt_no=COALESCE(receipt_no,${officialReceipt}),receipt_issued_at=COALESCE(receipt_issued_at,NOW()),note=COALESCE(NULLIF(${clean(b.note)},''),note),updated_at=NOW() WHERE donation_id=${donationId}`;
          await tx`INSERT INTO ledger_entries(entry_id,entry_date,entry_type,category,source,amount,reference_type,reference_id,member_code,description,note,created_by,status,created_at,updated_at,attachment_data,attachment_name,attachment_type)
            SELECT ${id('LED')},NOW(),'รายรับ','เงินบริจาค',${don.topic_title||'บริจาค'},${don.amount},'donation',${don.donation_id},${don.member_code||null},${'รับเงินบริจาค '+(don.donor_name||'')},${clean(b.note)||null},${admin},'posted',NOW(),NOW(),${don.slip_data||null},${don.slip_data?'หลักฐานการโอน '+don.donation_id:null},${don.slip_data?(String(don.slip_data).startsWith('data:application/pdf')?'application/pdf':'image/*'):null}
            WHERE NOT EXISTS (SELECT 1 FROM ledger_entries WHERE reference_type='donation' AND reference_id=${don.donation_id} AND entry_type='รายรับ')`;
        });}catch(e){return json(request,{success:false,code:'RECEIPT_BOOK_REQUIRED',message:String(e?.message||e)},409)}
        if(don.member_code)await notifyLinkedMember(sql,env,don.member_code,`💚 ยืนยันการรับบริจาคแล้ว\nจำนวน ${Number(don.amount||0).toLocaleString('th-TH')} บาท\nยืนยันเมื่อ ${lineDateTime()}\nเลขที่ใบเสร็จ: ${officialReceipt||'-'}\n\nพิมพ์ “ประวัติบริจาค” เพื่อดูรายละเอียด`);return json(request,{success:true,message:"ยืนยันการบริจาคและลงบัญชีรายรับเรียบร้อย",receipt_no:officialReceipt})
      }
      if(/^\/api\/admin\/donations\/[^/]+\/receipt$/.test(path)&&request.method==="GET"){
        const denied=await requireAdmin(request,env,sql);if(denied)return denied;await ensureV2616Schema(sql);const donationId=decodeURIComponent(path.split('/')[4]);
        /* V2.6.82: official donation receipt numbers come from receipt books. */
        const rows=await sql`SELECT d.donation_id,d.member_code,d.amount,d.donated_at,d.status,d.verified_by,d.verified_at,d.receipt_no,d.receipt_issued_at,d.donor_name,COALESCE(m.phone,d.phone) AS phone,COALESCE(m.email,d.email) AS email,COALESCE(dt.title,d.topic_id,'เงินบริจาค') AS donation_type,m.prefix,m.first_name,m.last_name,COALESCE(m.full_name,d.donor_name) AS full_name,COALESCE(a.address_line,d.address_line) AS address_line,COALESCE(a.subdistrict,d.subdistrict) AS subdistrict,COALESCE(a.district,d.district) AS district,COALESCE(a.province,d.province) AS province,COALESCE(a.postal_code,d.postal_code) AS postal_code FROM donations d LEFT JOIN donation_topics dt ON dt.topic_id=d.topic_id LEFT JOIN members m ON m.member_code=d.member_code LEFT JOIN addresses a ON a.member_code=d.member_code WHERE d.donation_id=${donationId} LIMIT 1`;
        if(!rows.length)return json(request,{success:false,message:'ไม่พบรายการบริจาค'},404);if(!['ตรวจสอบแล้ว','อนุมัติ','approved','verified'].includes(String(rows[0].status||'').toLowerCase())&&!['ตรวจสอบแล้ว','อนุมัติ'].includes(String(rows[0].status||'')))return json(request,{success:false,message:'ออกใบเสร็จได้เมื่อรายการได้รับอนุมัติแล้ว'},409);
        const st=await sql`SELECT setting_key,setting_value FROM app_settings WHERE setting_key IN ('APP_NAME','CONTACT_EMAIL','BANK_ACCOUNT_NAME','BANK_NAME','BANK_ACCOUNT_NO','ASSOCIATION_ADDRESS','ASSOCIATION_STAMP','HOME_QUOTE','HOME_QUOTE_BY','HOME_NEWS_TITLE')`;const settings={};for(const r of st)settings[r.setting_key]=r.setting_value;return json(request,{success:true,data:{...rows[0],source_type:'donation',transaction_id:donationId,settings}})
      }
      if(path==="/api/admin/ledger"){
        const denied=await requireAdmin(request,env,sql);if(denied)return denied;await ensureAccountingSchema(sql);
        if(request.method==="GET"){await syncBenefitUsageLedger(sql);const rows=await sql`SELECT le.entry_id,le.entry_date,le.entry_type,le.category,le.source,le.amount,le.reference_type,le.reference_id,le.member_code,le.description,le.note,le.created_by,le.status,le.created_at,le.updated_at,COALESCE(le.attachment_name,CASE WHEN p.slip_data IS NOT NULL THEN 'หลักฐานการโอน '||p.payment_id WHEN d.slip_data IS NOT NULL THEN 'หลักฐานการโอน '||d.donation_id END) AS attachment_name,COALESCE(le.attachment_type,CASE WHEN p.slip_data LIKE 'data:application/pdf%' OR d.slip_data LIKE 'data:application/pdf%' THEN 'application/pdf' WHEN p.slip_data IS NOT NULL OR d.slip_data IS NOT NULL THEN 'image/*' END) AS attachment_type,(COALESCE(le.attachment_data,p.slip_data,d.slip_data) IS NOT NULL AND COALESCE(le.attachment_data,p.slip_data,d.slip_data)<>'') AS has_attachment FROM ledger_entries le LEFT JOIN payments p ON le.reference_type='payment' AND p.payment_id=le.reference_id LEFT JOIN donations d ON le.reference_type='donation' AND d.donation_id=le.reference_id ORDER BY le.entry_date DESC,le.created_at DESC LIMIT 5000`;return json(request,{success:true,data:rows})}
        if(request.method==="POST"){
          const b=await body(request),type=clean(b.entry_type),amount=Number(b.amount||0),desc=clean(b.description),att=clean(b.attachment_data)||null;
          if(!['รายรับ','รายจ่าย'].includes(type))return json(request,{success:false,message:'กรุณาเลือกประเภทรายรับหรือรายจ่าย'},400);
          if(!desc||!Number.isFinite(amount)||amount<=0)return json(request,{success:false,message:'กรุณากรอกรายการและจำนวนเงินให้ถูกต้อง'},400);
          if(att&&!ledgerAttachmentOK(att))return json(request,{success:false,message:'หลักฐานรองรับ JPG/PNG/WEBP/PDF ขนาดไม่เกินประมาณ 2 MB'},400);
          const eid=id('LED'),admin=await currentAdminLabel(request,env,sql);
          const snapshot={entry_id:eid,entry_date:b.entry_date||null,entry_type:type,category:clean(b.category)||'ทั่วไป',source:clean(b.source)||'บันทึกด้วยมือ',amount,reference_id:clean(b.reference_id)||eid,member_code:clean(b.member_code)||null,description:desc,note:clean(b.note)||null,attachment_name:clean(b.attachment_name)||null,attachment_type:clean(b.attachment_type)||null};
          await sql.begin(async tx=>{
            await tx`INSERT INTO ledger_entries(entry_id,entry_date,entry_type,category,source,amount,reference_type,reference_id,member_code,description,note,created_by,status,created_at,updated_at,attachment_data,attachment_name,attachment_type) VALUES(${eid},COALESCE(${b.entry_date||null}::timestamptz,NOW()),${type},${snapshot.category},${snapshot.source},${amount},'manual',${snapshot.reference_id},${snapshot.member_code},${desc},${snapshot.note},${admin},'posted',NOW(),NOW(),${att},${snapshot.attachment_name},${snapshot.attachment_type})`;
            await tx`INSERT INTO ledger_admin_logs(log_id,entry_id,action,detail,old_data,new_data,admin_by,created_at) VALUES(${id('LLOG')},${eid},'create','เพิ่มรายการบัญชีด้วยมือ',NULL,CAST(${JSON.stringify(snapshot)} AS JSONB),${admin},NOW())`;
          });
          return json(request,{success:true,entry_id:eid,message:'บันทึกรายการบัญชีแล้ว'},201)
        }
      }
      if(path==="/api/admin/ledger/logs"&&request.method==="GET"){
        const denied=await requireAdmin(request,env,sql);if(denied)return denied;await ensureAccountingSchema(sql);
        const rows=await sql`SELECT log_id,entry_id,action,detail,admin_by,created_at FROM ledger_admin_logs ORDER BY created_at DESC LIMIT 1000`;
        return json(request,{success:true,data:rows})
      }
      if(/^\/api\/admin\/ledger\/[^/]+$/.test(path)&&request.method==="GET"){
        const denied=await requireAdmin(request,env,sql);if(denied)return denied;await ensureAccountingSchema(sql);const eid=decodeURIComponent(path.split('/').pop());
        const rows=await sql`SELECT le.*,COALESCE(le.attachment_data,p.slip_data,d.slip_data) AS attachment_data,COALESCE(le.attachment_name,CASE WHEN p.slip_data IS NOT NULL THEN 'หลักฐานการโอน '||p.payment_id WHEN d.slip_data IS NOT NULL THEN 'หลักฐานการโอน '||d.donation_id END) AS attachment_name,COALESCE(le.attachment_type,CASE WHEN p.slip_data LIKE 'data:application/pdf%' OR d.slip_data LIKE 'data:application/pdf%' THEN 'application/pdf' WHEN p.slip_data IS NOT NULL OR d.slip_data IS NOT NULL THEN 'image/*' END) AS attachment_type FROM ledger_entries le LEFT JOIN payments p ON le.reference_type='payment' AND p.payment_id=le.reference_id LEFT JOIN donations d ON le.reference_type='donation' AND d.donation_id=le.reference_id WHERE le.entry_id=${eid} LIMIT 1`;if(!rows.length)return json(request,{success:false,message:'ไม่พบรายการบัญชี'},404);return json(request,{success:true,data:rows[0]})
      }
      if(/^\/api\/admin\/ledger\/[^/]+\/logs$/.test(path)&&request.method==="GET"){
        const denied=await requireAdmin(request,env,sql);if(denied)return denied;await ensureAccountingSchema(sql);const eid=decodeURIComponent(path.split('/')[4]);
        const rows=await sql`SELECT log_id,entry_id,action,detail,admin_by,created_at FROM ledger_admin_logs WHERE entry_id=${eid} ORDER BY created_at DESC LIMIT 500`;
        return json(request,{success:true,data:rows})
      }
      if(/^\/api\/admin\/ledger\/[^/]+$/.test(path)&&request.method==="PUT"){
        const denied=await requireAdmin(request,env,sql);if(denied)return denied;await ensureAccountingSchema(sql);const eid=decodeURIComponent(path.split('/').pop()),b=await body(request);
        const before=await sql`SELECT * FROM ledger_entries WHERE entry_id=${eid} LIMIT 1`;if(!before.length)return json(request,{success:false,message:'ไม่พบรายการบัญชี'},404);
        if(String(before[0].reference_type||'')!=='manual')return json(request,{success:false,message:'แก้ไขได้เฉพาะรายการบัญชีที่บันทึกด้วยมือ'},409);
        const type=clean(b.entry_type),amount=Number(b.amount||0),desc=clean(b.description),hasNew=!!clean(b.attachment_data),remove=!!b.remove_attachment,att=hasNew?clean(b.attachment_data):null;
        if(!['รายรับ','รายจ่าย'].includes(type)||!desc||!Number.isFinite(amount)||amount<=0)return json(request,{success:false,message:'กรุณากรอกข้อมูลบัญชีให้ถูกต้อง'},400);
        if(att&&!ledgerAttachmentOK(att))return json(request,{success:false,message:'หลักฐานรองรับ JPG/PNG/WEBP/PDF ขนาดไม่เกินประมาณ 2 MB'},400);
        const admin=await currentAdminLabel(request,env,sql),oldLog={...before[0],attachment_data:before[0].attachment_data?'[มีไฟล์หลักฐาน]':null},after={entry_date:b.entry_date||before[0].entry_date,entry_type:type,category:clean(b.category)||'ทั่วไป',source:clean(b.source)||'บันทึกด้วยมือ',amount,reference_id:clean(b.reference_id)||before[0].reference_id,description:desc,note:clean(b.note)||null,attachment_name:hasNew?clean(b.attachment_name)||null:(remove?null:before[0].attachment_name),attachment_type:hasNew?clean(b.attachment_type)||null:(remove?null:before[0].attachment_type)};
        await sql.begin(async tx=>{
          await tx`UPDATE ledger_entries SET entry_date=COALESCE(${b.entry_date||null}::timestamptz,entry_date),entry_type=${type},category=${after.category},source=${after.source},amount=${amount},reference_id=${after.reference_id},description=${desc},note=${after.note},attachment_data=CASE WHEN ${hasNew} THEN ${att} WHEN ${remove} THEN NULL ELSE attachment_data END,attachment_name=CASE WHEN ${hasNew} THEN ${after.attachment_name} WHEN ${remove} THEN NULL ELSE attachment_name END,attachment_type=CASE WHEN ${hasNew} THEN ${after.attachment_type} WHEN ${remove} THEN NULL ELSE attachment_type END,updated_at=NOW() WHERE entry_id=${eid}`;
          await tx`INSERT INTO ledger_admin_logs(log_id,entry_id,action,detail,old_data,new_data,admin_by,created_at) VALUES(${id('LLOG')},${eid},'edit',${remove?'แก้ไขรายการบัญชีและลบหลักฐานเดิม':hasNew?'แก้ไขรายการบัญชีและเปลี่ยนหลักฐาน':'แก้ไขรายการบัญชี'},CAST(${JSON.stringify(oldLog)} AS JSONB),CAST(${JSON.stringify(after)} AS JSONB),${admin},NOW())`;
        });
        return json(request,{success:true,message:'บันทึกการแก้ไขรายการบัญชีแล้ว'})
      }
      if(/^\/api\/admin\/ledger\/[^/]+$/.test(path)&&request.method==="DELETE"){
        const denied=await requireAdmin(request,env,sql);if(denied)return denied;await ensureAccountingSchema(sql);const eid=decodeURIComponent(path.split('/').pop());const rows=await sql`SELECT * FROM ledger_entries WHERE entry_id=${eid} LIMIT 1`;if(!rows.length)return json(request,{success:false,message:'ไม่พบรายการบัญชี'},404);if(String(rows[0].reference_type||'')!=='manual')return json(request,{success:false,message:'รายการอัตโนมัติจากธุรกรรมไม่สามารถลบได้'},409);
        const oldLog={...rows[0],attachment_data:rows[0].attachment_data?'[มีไฟล์หลักฐาน]':null};await sql.begin(async tx=>{await tx`INSERT INTO ledger_admin_logs(log_id,entry_id,action,detail,old_data,new_data,admin_by,created_at) VALUES(${id('LLOG')},${eid},'delete','ลบรายการบัญชีที่บันทึกด้วยมือ',CAST(${JSON.stringify(oldLog)} AS JSONB),NULL,${await currentAdminLabel(request,env,sql)},NOW())`;await tx`DELETE FROM ledger_entries WHERE entry_id=${eid}`});
        return json(request,{success:true,message:'ลบรายการบัญชีแล้ว'})
      }
      if(path==="/api/admin/news"&&request.method==="GET"){
        const denied=await requireAdmin(request,env,sql);if(denied)return denied;await ensureNewsSchema(sql);
        const rows=await sql`SELECT news_id,category,title,content,publish_date,image_data,image_name,featured,active,created_at,updated_at FROM news ORDER BY publish_date DESC,created_at DESC LIMIT 1000`;
        return json(request,{success:true,data:rows});
      }
      if(path==="/api/admin/news"&&request.method==="POST"){
        const denied=await requireAdmin(request,env,sql);if(denied)return denied;await ensureNewsSchema(sql);const b=await body(request),nid=id('NEWS'),img=clean(b.image_data);
        if(!clean(b.title)||!clean(b.content))return json(request,{success:false,message:"กรุณากรอกหัวข้อและเนื้อหา"},400);
        if(img&&!newsImageOK(img))return json(request,{success:false,message:"รูปข่าวรองรับ JPG/PNG/WEBP ทุกหมวดแนบได้สูงสุด 8 รูป ระบบย่อแต่ละรูปอัตโนมัติ"},400);
        const cat=['ข่าวสาร','ประกาศ','กิจกรรม'].includes(clean(b.category))?clean(b.category):'ข่าวสาร';
        await sql`INSERT INTO news(news_id,category,title,content,publish_date,active,created_at,updated_at,image_data,image_name,featured) VALUES(${nid},${cat},${clean(b.title)},${clean(b.content)},COALESCE(${b.publish_date||null}::timestamptz,NOW()),${b.active!==false},NOW(),NOW(),${img||null},${clean(b.image_name)||null},${!!b.featured})`;
        return json(request,{success:true,news_id:nid},201)
      }
      if(/^\/api\/admin\/news\/[^/]+$/.test(path)&&request.method==="PUT"){
        const denied=await requireAdmin(request,env,sql);if(denied)return denied;await ensureNewsSchema(sql);const nid=decodeURIComponent(path.split('/').pop()),b=await body(request),img=clean(b.image_data),remove=!!b.remove_image;
        const before=await sql`SELECT news_id FROM news WHERE news_id=${nid} LIMIT 1`;if(!before.length)return json(request,{success:false,message:'ไม่พบข่าวสาร'},404);
        if(!clean(b.title)||!clean(b.content))return json(request,{success:false,message:'กรุณากรอกหัวข้อและเนื้อหา'},400);
        if(img&&!newsImageOK(img))return json(request,{success:false,message:'รูปข่าวรองรับ JPG/PNG/WEBP ทุกหมวดแนบได้สูงสุด 8 รูป ระบบย่อแต่ละรูปอัตโนมัติ'},400);
        const cat=['ข่าวสาร','ประกาศ','กิจกรรม'].includes(clean(b.category))?clean(b.category):'ข่าวสาร';
        await sql`UPDATE news SET category=${cat},title=${clean(b.title)},content=${clean(b.content)},publish_date=COALESCE(${b.publish_date||null}::timestamptz,publish_date),active=${b.active!==false},featured=${!!b.featured},image_data=CASE WHEN ${!!img} THEN ${img||null} WHEN ${remove} THEN NULL ELSE image_data END,image_name=CASE WHEN ${!!img} THEN ${clean(b.image_name)||null} WHEN ${remove} THEN NULL ELSE image_name END,updated_at=NOW() WHERE news_id=${nid}`;
        return json(request,{success:true,message:'บันทึกการแก้ไขแล้ว'})
      }
      if(/^\/api\/admin\/news\/[^/]+$/.test(path)&&request.method==="DELETE"){
        const denied=await requireAdmin(request,env,sql);if(denied)return denied;await ensureNewsSchema(sql);const nid=decodeURIComponent(path.split('/').pop());
        const rows=await sql`DELETE FROM news WHERE news_id=${nid} RETURNING news_id`;if(!rows.length)return json(request,{success:false,message:'ไม่พบข่าวสาร'},404);
        return json(request,{success:true,message:'ลบข่าวสารแล้ว'})
      }
      if(path==="/api/admin/media"&&request.method==="GET"){
        const denied=await requireAdmin(request,env,sql);if(denied)return denied;await ensureMediaSchema(sql);await ensureNewsSchema(sql);
        const rows=await sql`SELECT media_id,file_name,category,mime_type,image_data,size_bytes,created_by,created_at,updated_at FROM media_library ORDER BY created_at DESC LIMIT 500`;
        const nrows=await sql`SELECT news_id,category,title,image_data,image_name,publish_date,updated_at FROM news WHERE image_data IS NOT NULL AND image_data<>'' ORDER BY publish_date DESC,updated_at DESC LIMIT 500`;
        const seen=new Set(rows.map(x=>String(x.image_data||'')));
        const derived=[];
        for(const n of nrows){
          const imgs=newsImages(n.image_data);let names=[];try{const t=String(n.image_name||'').trim();names=t.startsWith('[')?JSON.parse(t):[t]}catch{names=[]}
          imgs.forEach((img,i)=>{if(!img||seen.has(String(img)))return;seen.add(String(img));const comma=String(img).indexOf(','),bytes=comma>=0?Math.floor((String(img).length-comma-1)*0.75):0;derived.push({media_id:`NEWS:${n.news_id}:${i}`,file_name:clean(names[i])||`${clean(n.title)||'news'}-${i+1}.jpg`,category:n.category||'ข่าวสาร',mime_type:(String(img).match(/^data:(image\/[^;]+);base64,/i)||[])[1]||'image/jpeg',image_data:img,size_bytes:bytes,created_by:'news',created_at:n.publish_date||n.updated_at,updated_at:n.updated_at,source_type:'news',source_id:n.news_id,source_title:n.title})})
        }
        const memberRows=await sql`SELECT member_code,photo_data,updated_at,registered_at FROM members WHERE photo_data IS NOT NULL AND photo_data<>'' ORDER BY updated_at DESC NULLS LAST LIMIT 1000`;
        for(const m of memberRows){const img=String(m.photo_data||'');if(!img||seen.has(img))continue;seen.add(img);const comma=img.indexOf(','),bytes=comma>=0?Math.floor((img.length-comma-1)*.75):0;derived.push({media_id:`MEMBER:${m.member_code}`,file_name:`${m.member_code}-member.jpg`,category:'รูปสมาชิก',mime_type:(img.match(/^data:(image\/[^;]+);base64,/i)||[])[1]||'image/jpeg',image_data:img,size_bytes:bytes,created_by:'members',created_at:m.registered_at,updated_at:m.updated_at,source_type:'member',source_id:m.member_code,source_title:m.member_code})}
        const pays=await sql`SELECT payment_id,member_code,slip_data,paid_at,updated_at FROM payments WHERE slip_data IS NOT NULL AND slip_data<>'' ORDER BY updated_at DESC LIMIT 1000`;
        for(const x of pays){const img=String(x.slip_data||'');if(!img||seen.has(img)||!img.startsWith('data:image/'))continue;seen.add(img);const comma=img.indexOf(','),bytes=comma>=0?Math.floor((img.length-comma-1)*.75):0;derived.push({media_id:`PAY:${x.payment_id}`,file_name:`${x.payment_id}-slip.jpg`,category:'หลักฐานค่าสมาชิก',mime_type:(img.match(/^data:(image\/[^;]+);base64,/i)||[])[1]||'image/jpeg',image_data:img,size_bytes:bytes,created_by:'payments',created_at:x.paid_at,updated_at:x.updated_at,source_type:'payment',source_id:x.payment_id,source_title:x.member_code||x.payment_id})}
        const dons=await sql`SELECT donation_id,member_code,donor_name,slip_data,donated_at,updated_at FROM donations WHERE slip_data IS NOT NULL AND slip_data<>'' ORDER BY updated_at DESC LIMIT 1000`;
        for(const x of dons){const img=String(x.slip_data||'');if(!img||seen.has(img)||!img.startsWith('data:image/'))continue;seen.add(img);const comma=img.indexOf(','),bytes=comma>=0?Math.floor((img.length-comma-1)*.75):0;derived.push({media_id:`DON:${x.donation_id}`,file_name:`${x.donation_id}-slip.jpg`,category:'หลักฐานบริจาค',mime_type:(img.match(/^data:(image\/[^;]+);base64,/i)||[])[1]||'image/jpeg',image_data:img,size_bytes:bytes,created_by:'donations',created_at:x.donated_at,updated_at:x.updated_at,source_type:'donation',source_id:x.donation_id,source_title:x.member_code||x.donor_name||x.donation_id})}
        await ensureBenefitsSchema(sql);const buses=await sql`SELECT usage_id,member_code,attachment_data,attachment_name,attachment_type,used_at,updated_at FROM benefit_usage WHERE active=TRUE AND attachment_data IS NOT NULL AND attachment_data<>'' ORDER BY updated_at DESC LIMIT 1000`;
        for(const x of buses){const img=String(x.attachment_data||'');if(!img||seen.has(img)||!img.startsWith('data:image/'))continue;seen.add(img);const comma=img.indexOf(','),bytes=comma>=0?Math.floor((img.length-comma-1)*.75):0;derived.push({media_id:`BEN:${x.usage_id}`,file_name:x.attachment_name||`${x.usage_id}-benefit-proof.jpg`,category:'หลักฐานการใช้สิทธิ์',mime_type:x.attachment_type||(img.match(/^data:(image\/[^;]+);base64,/i)||[])[1]||'image/jpeg',image_data:img,size_bytes:bytes,created_by:'benefits',created_at:x.used_at,updated_at:x.updated_at,source_type:'benefit',source_id:x.usage_id,source_title:x.member_code||x.usage_id})}
        return json(request,{success:true,data:[...rows.map(x=>({...x,source_type:'library'})),...derived]});
      }
      if(path==="/api/admin/media"&&request.method==="POST"){
        const denied=await requireAdmin(request,env,sql);if(denied)return denied;await ensureMediaSchema(sql);const b=await body(request),img=clean(b.image_data),name=clean(b.file_name)||'image.jpg',cat=clean(b.category)||'ข่าวสาร';
        if(!mediaImageOK(img))return json(request,{success:false,message:'รูปต้องเป็น JPG/PNG/WEBP และหลังย่อไม่เกินประมาณ 650 KB'},400);
        const comma=img.indexOf(','),bytes=comma>=0?Math.floor((img.length-comma-1)*0.75):0,mid=id('MEDIA');
        await sql`INSERT INTO media_library(media_id,file_name,category,mime_type,image_data,size_bytes,created_by,created_at,updated_at) VALUES(${mid},${name},${cat},${clean(b.mime_type)||'image/jpeg'},${img},${bytes},${await currentAdminLabel(request,env,sql)},NOW(),NOW())`;
        return json(request,{success:true,media_id:mid},201);
      }
      if(/^\/api\/admin\/media\/[^/]+$/.test(path)&&request.method==="DELETE"){
        const denied=await requireAdmin(request,env,sql);if(denied)return denied;await ensureMediaSchema(sql);const mid=decodeURIComponent(path.split('/').pop());
        const rows=await sql`DELETE FROM media_library WHERE media_id=${mid} RETURNING media_id`;if(!rows.length)return json(request,{success:false,message:'ไม่พบรูปในคลัง'},404);
        return json(request,{success:true,message:'ลบรูปจากคลังแล้ว'});
      }

      if(path==="/api/admin/benefits"&&request.method==="GET"){const denied=await requireAdmin(request,env,sql);if(denied)return denied;await ensureBenefitsSchema(sql);const rows=await sql`SELECT benefit_id,title,description,start_date,end_date,active,created_at,updated_at FROM benefits ORDER BY created_at DESC`;return json(request,{success:true,data:rows})}
      if(path==="/api/admin/benefits"&&request.method==="POST"){const denied=await requireAdmin(request,env,sql);if(denied)return denied;await ensureBenefitsSchema(sql);const b=await body(request),bid=id('BEN');if(!clean(b.title))return json(request,{success:false,message:"กรุณากรอกชื่อสิทธิประโยชน์"},400);await sql`INSERT INTO benefits(benefit_id,title,description,start_date,end_date,active,created_at,updated_at) VALUES(${bid},${clean(b.title)},${clean(b.description)||null},${b.start_date||null},${b.end_date||null},TRUE,NOW(),NOW())`;return json(request,{success:true,benefit_id:bid},201)}
      if(/^\/api\/admin\/benefits\/[^/]+$/.test(path)&&request.method==="PUT"){const denied=await requireAdmin(request,env,sql);if(denied)return denied;await ensureBenefitsSchema(sql);const bid=decodeURIComponent(path.split('/').pop()),b=await body(request);const rows=await sql`UPDATE benefits SET title=${clean(b.title)},description=${clean(b.description)||null},start_date=${b.start_date||null},end_date=${b.end_date||null},updated_at=NOW() WHERE benefit_id=${bid} RETURNING benefit_id`;if(!rows.length)return json(request,{success:false,message:'ไม่พบสิทธิประโยชน์'},404);return json(request,{success:true})}
      if(/^\/api\/admin\/benefits\/[^/]+\/status$/.test(path)&&request.method==="PATCH"){const denied=await requireAdmin(request,env,sql);if(denied)return denied;await ensureBenefitsSchema(sql);const bid=decodeURIComponent(path.split('/')[4]),b=await body(request);await sql`UPDATE benefits SET active=${!!b.active},updated_at=NOW() WHERE benefit_id=${bid}`;return json(request,{success:true})}
      if(path==="/api/admin/benefit-usage"&&request.method==="GET"){const denied=await requireAdmin(request,env,sql);if(denied)return denied;await ensureBenefitsSchema(sql);const rows=await sql`SELECT u.usage_id,u.member_code,u.benefit_id,u.used_at,u.amount,u.note,u.recorded_by,u.active,u.created_at,u.updated_at,COALESCE(b.title,u.benefit_id) benefit_title,COALESCE(m.full_name,TRIM(CONCAT_WS(' ',m.prefix,m.first_name,m.last_name)),u.member_code) member_name,(u.attachment_data IS NOT NULL AND u.attachment_data<>'') AS has_attachment,u.attachment_name,u.attachment_type FROM benefit_usage u LEFT JOIN benefits b ON b.benefit_id=u.benefit_id LEFT JOIN members m ON m.member_code=u.member_code WHERE u.active=TRUE ORDER BY u.used_at DESC,u.created_at DESC`;return json(request,{success:true,data:rows})}
      if(/^\/api\/admin\/benefit-usage\/[^/]+$/.test(path)&&request.method==="PUT"){const denied=await requireAdmin(request,env,sql);if(denied)return denied;await ensureBenefitsSchema(sql);await ensureAccountingSchema(sql);const uid=decodeURIComponent(path.split('/').pop()),b=await body(request),amount=Math.max(0,Number(b.amount||0)),att=clean(b.attachment_data)||null,hasAtt=Object.prototype.hasOwnProperty.call(b,'attachment_data');if(att&&!ledgerAttachmentOK(att))return json(request,{success:false,message:'หลักฐานรองรับ JPG/PNG/WEBP/PDF ขนาดไม่เกินประมาณ 2 MB'},400);const rows=await sql`UPDATE benefit_usage SET member_code=${clean(b.member_code).toUpperCase()},benefit_id=${clean(b.benefit_id)},used_at=${b.used_at||new Date().toISOString()},amount=${amount},note=${clean(b.note)||null},attachment_data=CASE WHEN ${hasAtt} THEN ${att} ELSE attachment_data END,attachment_name=CASE WHEN ${hasAtt} THEN ${clean(b.attachment_name)||null} ELSE attachment_name END,attachment_type=CASE WHEN ${hasAtt} THEN ${clean(b.attachment_type)||null} ELSE attachment_type END,updated_at=NOW() WHERE usage_id=${uid} AND active=TRUE RETURNING usage_id`;if(!rows.length)return json(request,{success:false,message:'ไม่พบบันทึกการใช้สิทธิ์'},404);const ben=await sql`SELECT title FROM benefits WHERE benefit_id=${clean(b.benefit_id)} LIMIT 1`;if(amount>0){const led=await sql`SELECT entry_id FROM ledger_entries WHERE reference_type='benefit_usage' AND reference_id=${uid} ORDER BY created_at LIMIT 1`;if(led.length){await sql`UPDATE ledger_entries SET entry_date=${b.used_at||new Date().toISOString()},amount=${amount},member_code=${clean(b.member_code).toUpperCase()},description=${'ค่าใช้สิทธิ์: '+(ben[0]?.title||clean(b.benefit_id))},note=${clean(b.note)||null},attachment_data=CASE WHEN ${hasAtt} THEN ${att} ELSE attachment_data END,attachment_name=CASE WHEN ${hasAtt} THEN ${clean(b.attachment_name)||null} ELSE attachment_name END,attachment_type=CASE WHEN ${hasAtt} THEN ${clean(b.attachment_type)||null} ELSE attachment_type END,status='posted',updated_at=NOW() WHERE entry_id=${led[0].entry_id}`;}else{await sql`INSERT INTO ledger_entries(entry_id,entry_date,entry_type,category,source,amount,reference_type,reference_id,member_code,description,note,created_by,status,created_at,updated_at,attachment_data,attachment_name,attachment_type) VALUES(${id('LED')},${b.used_at||new Date().toISOString()},'รายจ่าย','สิทธิประโยชน์สมาชิก','benefit_usage',${amount},'benefit_usage',${uid},${clean(b.member_code).toUpperCase()},${'ค่าใช้สิทธิ์: '+(ben[0]?.title||clean(b.benefit_id))},${clean(b.note)||null},'admin','posted',NOW(),NOW(),${att},${clean(b.attachment_name)||null},${clean(b.attachment_type)||null})`;}}else{await sql`UPDATE ledger_entries SET status='void',updated_at=NOW() WHERE reference_type='benefit_usage' AND reference_id=${uid}`;}return json(request,{success:true})}
      if(/^\/api\/admin\/benefit-usage\/[^/]+$/.test(path)&&request.method==="DELETE"){const denied=await requireAdmin(request,env,sql);if(denied)return denied;await ensureBenefitsSchema(sql);await ensureAccountingSchema(sql);const uid=decodeURIComponent(path.split('/').pop());await sql`UPDATE benefit_usage SET active=FALSE,updated_at=NOW() WHERE usage_id=${uid}`;await sql`UPDATE ledger_entries SET status='void',updated_at=NOW() WHERE reference_type='benefit_usage' AND reference_id=${uid}`;return json(request,{success:true})}


      if(/^\/api\/admin\/benefit-usage\/[^/]+\/attachment$/.test(path)&&request.method==="GET"){
        const denied=await requireAdmin(request,env,sql);if(denied)return denied;await ensureBenefitsSchema(sql);const uid=decodeURIComponent(path.split('/')[4]);const rows=await sql`SELECT attachment_data,attachment_name,attachment_type FROM benefit_usage WHERE usage_id=${uid} AND active=TRUE LIMIT 1`;if(!rows.length)return json(request,{success:false,message:'ไม่พบบันทึกการใช้สิทธิ์'},404);return json(request,{success:true,data:rows[0]});
      }
      if(/^\/api\/admin\/benefits\/[^/]+$/.test(path)&&request.method==="DELETE"){
        const denied=await requireAdmin(request,env,sql);if(denied)return denied;await ensureBenefitsSchema(sql);const bid=decodeURIComponent(path.split('/').pop());const c=await sql`SELECT COUNT(*)::int n FROM benefit_usage WHERE benefit_id=${bid}`;if(Number(c[0]?.n||0)>0)return json(request,{success:false,message:'สิทธิ์นี้เคยถูกใช้งานแล้ว จึงลบไม่ได้ ให้ปิดใช้งานแทน'},409);const d=await sql`DELETE FROM benefits WHERE benefit_id=${bid} RETURNING benefit_id`;if(!d.length)return json(request,{success:false,message:'ไม่พบสิทธิประโยชน์'},404);return json(request,{success:true});
      }

      if(path==="/api/admin/me"&&request.method==="GET"){
        const denied=await requireAdmin(request,env,sql);if(denied)return denied;const a=await resolveAdmin(request,env,sql);return json(request,{success:true,data:a,label:adminLabel(a)});
      }
      if(path==="/api/admin/accounts"&&request.method==="GET"){
        const denied=await requireOwner(request,env,sql);if(denied)return denied;await ensureAdminAccountsSchema(sql);
        const rows=await sql`SELECT admin_id,full_name,role,active,contact_phone,phone_enabled,created_at,updated_at,last_login_at FROM admin_accounts ORDER BY role DESC,full_name,admin_id`;
        return json(request,{success:true,data:rows});
      }
      if(path==="/api/admin/accounts"&&request.method==="POST"){
        const denied=await requireOwner(request,env,sql);if(denied)return denied;await ensureAdminAccountsSchema(sql);const b=await body(request),aid=clean(b.admin_id).toUpperCase(),name=clean(b.full_name),key=clean(b.admin_key),role=clean(b.role)==='owner'?'owner':'admin',phone=clean(b.contact_phone).replace(/[\s-]/g,''),phoneEnabled=!!b.phone_enabled;
        if(!aid||!name||key.length<8)return json(request,{success:false,message:'กรุณากรอก User ID, ชื่อ-นามสกุล และ Key อย่างน้อย 8 ตัวอักษร'},400);const h=await sha256Hex(key);
        if(phone&&!/^\+?\d{9,12}$/.test(phone))return json(request,{success:false,message:'เบอร์โทรแอดมินไม่ถูกต้อง'},400);try{await sql`INSERT INTO admin_accounts(admin_id,full_name,key_hash,role,active,contact_phone,phone_enabled,created_at,updated_at) VALUES(${aid},${name},${h},${role},TRUE,${phone||null},${phoneEnabled&&!!phone},NOW(),NOW())`;return json(request,{success:true,admin_id:aid},201)}catch(e){return json(request,{success:false,message:e?.code==='23505'?'User ID นี้มีอยู่แล้ว':'เพิ่มบัญชี Admin ไม่สำเร็จ'},e?.code==='23505'?409:500)}
      }
      if(/^\/api\/admin\/accounts\/[^/]+$/.test(path)&&request.method==="PUT"){
        const denied=await requireOwner(request,env,sql);if(denied)return denied;await ensureAdminAccountsSchema(sql);
        const aid=decodeURIComponent(path.split('/').pop()).toUpperCase(),b=await body(request),name=clean(b.full_name),role=clean(b.role)==='owner'?'owner':'admin',active=b.active!==false,key=clean(b.admin_key),newAid=clean(b.new_admin_id).toUpperCase()||aid,phone=clean(b.contact_phone).replace(/[\s-]/g,''),phoneEnabled=!!b.phone_enabled;
        if(!newAid||!name)return json(request,{success:false,message:'กรุณากรอก User ID และชื่อ-นามสกุล'},400);
        if(key&&key.length<8)return json(request,{success:false,message:'Admin Key ใหม่ต้องมีอย่างน้อย 8 ตัวอักษร'},400);if(phone&&!/^\+?\d{9,12}$/.test(phone))return json(request,{success:false,message:'เบอร์โทรแอดมินไม่ถูกต้อง'},400);
        const h=key?await sha256Hex(key):null;
        const cur=await sql`SELECT admin_id,role,active FROM admin_accounts WHERE admin_id=${aid} LIMIT 1`;if(!cur.length)return json(request,{success:false,message:'ไม่พบบัญชี Admin'},404);
        if(cur[0].role==='owner'&&cur[0].active&&(role!=='owner'||!active)){const owners=await sql`SELECT COUNT(*)::int n FROM admin_accounts WHERE role='owner' AND active=TRUE`;if(Number(owners[0]?.n||0)<=1)return json(request,{success:false,message:'ไม่สามารถปิดหรือลดสิทธิ์ Owner คนสุดท้ายได้'},409)}
        try{
          const rows=h
            ?await sql`UPDATE admin_accounts SET admin_id=${newAid},full_name=${name},role=${role},active=${active},contact_phone=${phone||null},phone_enabled=${phoneEnabled&&!!phone},key_hash=${h},updated_at=NOW() WHERE admin_id=${aid} RETURNING admin_id`
            :await sql`UPDATE admin_accounts SET admin_id=${newAid},full_name=${name},role=${role},active=${active},contact_phone=${phone||null},phone_enabled=${phoneEnabled&&!!phone},updated_at=NOW() WHERE admin_id=${aid} RETURNING admin_id`;
          return json(request,{success:true,admin_id:rows[0].admin_id});
        }catch(e){return json(request,{success:false,message:e?.code==='23505'?'User ID นี้มีอยู่แล้ว':'แก้ไขบัญชี Admin ไม่สำเร็จ'},e?.code==='23505'?409:500)}
      }
      if(/^\/api\/admin\/accounts\/[^/]+$/.test(path)&&request.method==="DELETE"){
        const denied=await requireOwner(request,env,sql);if(denied)return denied;await ensureAdminAccountsSchema(sql);const aid=decodeURIComponent(path.split('/').pop()).toUpperCase();
        const cur=await sql`SELECT role,active FROM admin_accounts WHERE admin_id=${aid} LIMIT 1`;if(!cur.length)return json(request,{success:false,message:'ไม่พบบัญชี Admin'},404);
        if(cur[0].role==='owner'&&cur[0].active){const owners=await sql`SELECT COUNT(*)::int n FROM admin_accounts WHERE role='owner' AND active=TRUE`;if(Number(owners[0]?.n||0)<=1)return json(request,{success:false,message:'ไม่สามารถปิด Owner คนสุดท้ายได้'},409)}
        await sql`UPDATE admin_accounts SET active=FALSE,updated_at=NOW() WHERE admin_id=${aid}`;return json(request,{success:true});
      }
      if(path==="/api/admin/settings"&&request.method==="GET"){
        const denied=await requireAdmin(request,env,sql);if(denied)return denied;await ensureV2616Schema(sql);
        const rows=await sql`SELECT setting_key,setting_value FROM app_settings ORDER BY setting_key`;
        const data={};for(const r of rows)data[r.setting_key]=r.setting_value;
        return json(request,{success:true,data});
      }
      if(path==="/api/admin/settings"&&request.method==="PUT"){
        const denied=await requireAdmin(request,env,sql);if(denied)return denied;await ensureV2616Schema(sql);const b=await body(request);
        const newAdminKey=clean(b.NEW_ADMIN_API_KEY);
        if(newAdminKey){if(newAdminKey.length<8)return json(request,{success:false,message:'Admin API Key ใหม่ต้องมีอย่างน้อย 8 ตัวอักษร'},400);const h=await sha256Hex(newAdminKey);await sql`INSERT INTO app_settings(setting_key,setting_value,updated_at) VALUES('ADMIN_API_KEY_HASH',${h},NOW()) ON CONFLICT(setting_key) DO UPDATE SET setting_value=EXCLUDED.setting_value,updated_at=NOW()`;}
        if(Object.prototype.hasOwnProperty.call(b,'HOME_HERO_IMAGE')&&!homeHeroImageOK(b.HOME_HERO_IMAGE))return json(request,{success:false,message:'รูปปกเดสก์ท็อปไม่ถูกต้องหรือมีขนาดใหญ่เกินไป'},400);
        if(Object.prototype.hasOwnProperty.call(b,'HOME_HERO_MOBILE_IMAGE')&&!homeHeroImageOK(b.HOME_HERO_MOBILE_IMAGE))return json(request,{success:false,message:'รูปปกมือถือไม่ถูกต้องหรือมีขนาดใหญ่เกินไป'},400);
        if(clean(b.CONTACT_PHONE)&&!/^\+?\d{9,12}$/.test(clean(b.CONTACT_PHONE).replace(/[\s-]/g,'')))return json(request,{success:false,message:'เบอร์โทรแอดมินไม่ถูกต้อง กรุณากรอกตัวเลข 9–12 หลัก'},400);
        const allowed=['APP_NAME','MEMBERSHIP_FEE_YEARLY','MEMBERSHIP_FEE_MONTHLY','PROMPTPAY','BANK_ACCOUNT_NAME','BANK_NAME','BANK_ACCOUNT_NO','CONTACT_EMAIL','CONTACT_PHONE','CONTACT_PHONE_ENABLED','ASSOCIATION_ADDRESS','ASSOCIATION_STAMP','HOME_QUOTE','HOME_QUOTE_BY','HOME_NEWS_TITLE','HOME_HERO_IMAGE','HOME_HERO_MOBILE_IMAGE','ADMIN_SESSION_TIMEOUT_MIN'];
        for(const [k,v] of Object.entries(b)){if(!allowed.includes(k))continue;await sql`INSERT INTO app_settings(setting_key,setting_value,updated_at) VALUES(${k},${clean(v)},NOW()) ON CONFLICT(setting_key) DO UPDATE SET setting_value=EXCLUDED.setting_value,updated_at=NOW()`}
        await sql`INSERT INTO app_settings(setting_key,setting_value,updated_at) VALUES('APP_VERSION','V2.7.07',NOW()) ON CONFLICT(setting_key) DO UPDATE SET setting_value=EXCLUDED.setting_value,updated_at=NOW()`;
        if(Object.prototype.hasOwnProperty.call(b,'MEMBERSHIP_FEE_YEARLY')){const fee=Number(b.MEMBERSHIP_FEE_YEARLY||0)||null;await sql`INSERT INTO payment_topics(topic_id,title,description,amount,active,created_at,updated_at) VALUES('membership','ค่าบำรุงสมาคมศิษย์เก่าฯ รายปี','สนับสนุนสมาคมฯ รายปี',${fee},TRUE,NOW(),NOW()) ON CONFLICT(topic_id) DO UPDATE SET amount=EXCLUDED.amount,active=TRUE,updated_at=NOW()`}
        return json(request,{success:true,message:newAdminKey?"บันทึกการตั้งค่าและเปลี่ยน Admin API Key แล้ว":"บันทึกการตั้งค่าแล้ว",admin_key_changed:!!newAdminKey})
      }

      return json(request,{success:false,message:"API endpoint not found"},404);
    }catch(error){console.error("SK Alumni API Error",error);return json(request,{success:false,message:"Internal server error",error:String(error?.message||error),code:error?.code||null},500)}finally{if(sql)await sql.end().catch(()=>{})}
  }
};
