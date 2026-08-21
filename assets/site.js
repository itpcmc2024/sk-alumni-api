const SK={API:'https://sk-alumni-api.itpcmc2024.workers.dev',VERSION:'V2.6.26'};
(()=>{const st=document.createElement('style');st.textContent='.sk-app-line{display:block}.brand-title .sk-app-line,.brand [data-app-name] .sk-app-line,[data-app-name].brand .sk-app-line{white-space:nowrap}@media(max-width:900px){.brand-title .sk-app-line,[data-app-name].brand .sk-app-line{white-space:normal}}';document.head.appendChild(st)})();
function e(v){return String(v??'').replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;').replaceAll("'",'&#039;')}
async function api(path,opts={}){const r=await fetch(SK.API+path,{cache:'no-store',...opts,headers:{'Content-Type':'application/json',...(opts.headers||{})}});let j={};try{j=await r.json()}catch{}if(!r.ok)throw new Error(j.message||j.error||`HTTP ${r.status}`);return j}
function fmtDate(v){if(!v)return'-';try{return new Intl.DateTimeFormat('th-TH',{dateStyle:'medium',timeStyle:'short'}).format(new Date(v))}catch{return String(v)}}
function footer(moduleName){return `<footer class="footer"><div class="wrap footin"><div class="footbrand"><img src="assets/association-logo.png"><div><b style="color:#086a4b">สมาคมศิษย์เก่านูรุ้ลอิสลามสัมพันธ์ (สุเหร่าเขียว)</b><div style="font-size:12px;color:#748396">🌙 Nurul Islam · สานสัมพันธ์ศิษย์เก่า</div></div></div><div class="footcopy">© 2026 SK Alumni Member System by Kimhan · ${moduleName} ${SK.VERSION}</div></div></footer>`}

function applyPublicSettings(d){
  d=d||{};window.SK_SETTINGS=d;
  if(d.APP_NAME){
    const raw=String(d.APP_NAME||'').replace(/\s+/g,' ').trim();
    let line1='ระบบสมาชิกสมาคมศิษย์เก่า',line2='นูรุ้ลอิสลามสัมพันธ์ (สุเหร่าเขียว)';
    const ix=raw.indexOf('นูรุ้ลอิสลาม');
    if(ix>0){line1=raw.slice(0,ix).trim()||line1;line2=raw.slice(ix).trim()||line2}
    document.querySelectorAll('[data-app-name]').forEach(el=>{if(!el||!el.isConnected)return;if(el.matches('input,textarea,select')) el.value=raw; else el.innerHTML='<span class="sk-app-line">'+e(line1)+'</span><span class="sk-app-line">'+e(line2)+'</span>'});
    document.documentElement.dataset.appName=raw;
  }
  try{document.dispatchEvent(new CustomEvent('sk:settings',{detail:d}))}catch(_){} return d;
}
async function loadPublicSettings(){
  const CK='sk_public_settings_v2625',TK=CK+'_ts';
  try{const c=localStorage.getItem(CK),ts=Number(localStorage.getItem(TK)||0);if(c&&Date.now()-ts<120000)applyPublicSettings(JSON.parse(c))}catch{}
  try{const j=await api('/api/settings/public');const d=j.data||{};try{localStorage.setItem(CK,JSON.stringify(d));localStorage.setItem(TK,String(Date.now()))}catch{};return applyPublicSettings(d)}catch(_){return window.SK_SETTINGS||{}}
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',()=>{loadPublicSettings()},{once:true});else loadPublicSettings();
