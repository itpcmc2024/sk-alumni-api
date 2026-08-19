const SK={API:'https://sk-alumni-api.itpcmc2024.workers.dev',VERSION:'V2.6.18'};
function e(v){return String(v??'').replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;').replaceAll("'",'&#039;')}
async function api(path,opts={}){const r=await fetch(SK.API+path,{cache:'no-store',...opts,headers:{'Content-Type':'application/json',...(opts.headers||{})}});let j={};try{j=await r.json()}catch{}if(!r.ok)throw new Error(j.message||j.error||`HTTP ${r.status}`);return j}
function fmtDate(v){if(!v)return'-';try{return new Intl.DateTimeFormat('th-TH',{dateStyle:'medium',timeStyle:'short'}).format(new Date(v))}catch{return String(v)}}
function footer(moduleName){return `<footer class="footer"><div class="wrap footin"><div class="footbrand"><img src="assets/association-logo.png"><div><b style="color:#086a4b">สมาคมศิษย์เก่านูรุ้ลอิสลามสัมพันธ์ (สุเหร่าเขียว)</b><div style="font-size:12px;color:#748396">🌙 Nurul Islam · สานสัมพันธ์ศิษย์เก่า</div></div></div><div class="footcopy">© 2026 SK Alumni Member System by Kimhan · ${moduleName} ${SK.VERSION}</div></div></footer>`}

async function loadPublicSettings(){
  try{
    const j=await api('/api/settings/public');
    const d=j.data||{};
    window.SK_SETTINGS=d;
    if(d.APP_NAME){
      const raw=String(d.APP_NAME||'').replace(/\s+/g,' ').trim();
      let line1=raw,line2='';
      const m=raw.match(/นูรุ้ลอิสลาม\s*สัมพันธ์.*$/);
      if(m&&m.index>0){line1=raw.slice(0,m.index).trim();line2=m[0].replace(/นูรุ้ลอิสลาม\s*สัมพันธ์/,'นูรุ้ลอิสลามสัมพันธ์').trim()}
      else if(raw.includes('สมาคมศิษย์เก่า')){line1='ระบบสมาชิกสมาคมศิษย์เก่า';line2='นูรุ้ลอิสลามสัมพันธ์ (สุเหร่าเขียว)'}
      document.querySelectorAll('[data-app-name]').forEach(el=>{
        if(el.matches('input,textarea,select')) el.value=raw;
        else if(line2) el.innerHTML='<span class="sk-app-line">'+e(line1)+'</span><span class="sk-app-line">'+e(line2)+'</span>';
        else el.innerHTML='<span class="sk-app-line">'+e(line1)+'</span>';
      });
      document.documentElement.dataset.appName=raw;
      const t=document.querySelector('title'); if(t&&t.dataset.appTitle==='1') t.textContent=raw;
    }
    document.dispatchEvent(new CustomEvent('sk:settings',{detail:d}));
    return d;
  }catch(_){return {}}
}
document.addEventListener('DOMContentLoaded',()=>{loadPublicSettings()});
