const SK={API:'https://sk-alumni-api.itpcmc2024.workers.dev',VERSION:'V2.6.17'};
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
      const marker='นูรุ้ลอิสลามสัมพันธ์';
      let line1=raw,line2='';
      const i=raw.indexOf(marker);
      if(i>0){ line1=raw.slice(0,i).trim(); line2=raw.slice(i).trim(); }
      document.querySelectorAll('[data-app-name]').forEach(el=>{
        if(el.matches('input,textarea,select')) el.value=raw;
        else if(line2) el.innerHTML=e(line1)+'<br>'+e(line2);
        else el.textContent=raw;
      });
      document.documentElement.dataset.appName=raw;
      const t=document.querySelector('title'); if(t&&t.dataset.appTitle==='1') t.textContent=raw;
    }
    document.dispatchEvent(new CustomEvent('sk:settings',{detail:d}));
    return d;
  }catch(_){return {}}
}
document.addEventListener('DOMContentLoaded',()=>{loadPublicSettings()});
