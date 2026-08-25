(function(){
'use strict';
const API='https://sk-alumni-api.itpcmc2024.workers.dev';
const KEYS=['sk_alumni_admin_key','SK_ALUMNI_ADMIN_KEY','adminKey'];
const LAST='sk_alumni_admin_last_activity';
const TIMEOUT_CACHE='sk_alumni_admin_timeout_min';
let timeoutMin=Math.max(1,Math.min(240,Number(localStorage.getItem(TIMEOUT_CACHE)||10)||10));
let lastWrite=0,checking=false,timer=null;
function getKey(){for(const k of KEYS){const v=sessionStorage.getItem(k);if(v)return v}return''}
function clearSession(){KEYS.forEach(k=>{localStorage.removeItem(k);sessionStorage.removeItem(k)});localStorage.removeItem(LAST);sessionStorage.removeItem(LAST)}
function loginUrl(){return 'admin.html?v=2.6.86'}
function touch(force=false){if(!getKey())return;const now=Date.now();if(!force&&now-lastWrite<15000)return;lastWrite=now;localStorage.setItem(LAST,String(now))}
function expired(){const last=Number(localStorage.getItem(LAST)||0);return !!last && Date.now()-last>timeoutMin*60000}
async function loadTimeout(){const key=getKey();if(!key)return;try{const r=await fetch(API+'/api/admin/settings',{cache:'no-store',headers:{Authorization:'Bearer '+key,'X-Admin-Key':key}});if(!r.ok)return;const j=await r.json();const n=Number(j?.data?.ADMIN_SESSION_TIMEOUT_MIN||10);timeoutMin=Math.max(1,Math.min(240,n||10));localStorage.setItem(TIMEOUT_CACHE,String(timeoutMin))}catch(_){}}
async function enforce(){if(checking||!getKey())return;if(expired()){checking=true;clearSession();try{if(window.Swal)await Swal.fire({icon:'info',title:'หมดเวลาใช้งาน Admin',text:'ไม่มีการใช้งานเกิน '+timeoutMin+' นาที กรุณาเข้าสู่ระบบใหม่',confirmButtonText:'เข้าสู่ระบบ'})}catch(_){}location.replace(loginUrl());return}}
function start(){KEYS.forEach(k=>localStorage.removeItem(k));if(!getKey())return;const last=Number(localStorage.getItem(LAST)||0);if(!last)touch(true);loadTimeout().finally(()=>enforce());['pointerdown','keydown','input','change','scroll','touchstart'].forEach(ev=>window.addEventListener(ev,()=>touch(false),{passive:true}));timer=setInterval(enforce,15000);document.addEventListener('visibilitychange',()=>{if(!document.hidden)enforce()});}
window.SK_ADMIN_SESSION={touch,clear:clearSession,getTimeout:()=>timeoutMin};
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',start,{once:true});else start();
})();