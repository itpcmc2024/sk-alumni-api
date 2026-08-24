(()=>{
  'use strict';
  const path=(location.pathname.split('/').pop()||'index.html').toLowerCase();
  const V='2.6.77';
  try{const u=new URL(location.href);if(u.searchParams.get('v')!==V){u.searchParams.set('v',V);history.replaceState(null,'',u.pathname+u.search+u.hash)}}catch{}
  const items=[['index.html','🕌','หน้าแรก'],['register.html','🧕🏻','ลงทะเบียน'],['status.html','🔎','ตรวจสอบ'],['benefits.html','🎁','สิทธิประโยชน์'],['donation.html','🤲🏻','บริจาค'],['news.html','📣','ข่าวสาร'],['admin-home.html','🌙','Admin']];
  const isAdmin=path.startsWith('admin');
  const publicPages=new Set(['index.html','register.html','status.html','benefits.html','member.html','payment.html','donation.html','news.html']);
  const active=(href)=>path===href||(href==='benefits.html'&&path==='member.html')||(href==='admin-home.html'&&isAdmin);
  function adminKey(){for(const k of ['sk_alumni_admin_key','SK_ALUMNI_ADMIN_KEY','adminKey']){const v=localStorage.getItem(k)||sessionStorage.getItem(k);if(v){try{['sk_alumni_admin_key','SK_ALUMNI_ADMIN_KEY','adminKey'].forEach(n=>localStorage.setItem(n,v))}catch{}return v}}return''}function clearAdminKey(){['sk_alumni_admin_key','SK_ALUMNI_ADMIN_KEY','adminKey'].forEach(k=>{localStorage.removeItem(k);sessionStorage.removeItem(k)});}
  function logout(){clearAdminKey(); try{document.getElementById('logoutBtn')?.click()}catch{}; location.href='admin.html?v='+V;}
  const mobileAdmin=isAdmin&&path!=='admin-home.html'?`<a class="sk-mobile-admin-back" href="admin-home.html?v=${V}">🧩 ศูนย์จัดการระบบ</a><button type="button" class="sk-mobile-admin-logout">ออกจากระบบ</button>`:'';
  const mobilePublicAdmin=!isAdmin?`<a class="sk-mobile-public-admin" href="admin-home.html?v=${V}">🌙 Admin</a>`:'';
  const header=()=>`<header class="sk-module-nav" data-sk-nav="v2.6.77"><div class="sk-nav-wrap"><a class="sk-nav-brand" href="index.html?v=${V}"><img class="sk-nav-logo" src="assets/association-logo.png?v=${V}" alt="โลโก้สมาคม"><div><div class="sk-nav-title" data-app-name><span class="sk-app-line">ระบบสมาชิกสมาคมศิษย์เก่า</span><span class="sk-app-line">นูรุ้ลอิสลามสัมพันธ์ (สุเหร่าเขียว)</span></div><div class="sk-nav-sub">🌙 Nurul Islam · SK Alumni Member System</div></div></a><nav class="sk-nav-icons">${items.map(x=>`<a class="${active(x[0])?'active':''}" href="${x[0]}?v=${V}"><span class="ico">${x[1]}</span>${x[2]}</a>`).join('')}</nav><div class="sk-mobile-home"><a href="index.html?v=${V}">🏠 หน้าแรก</a>${mobilePublicAdmin}${mobileAdmin}</div></div></header>`;
  function ensureHeader(){
    if(document.querySelector('[data-sk-nav="v2.6.77"]')) return;
    const holder=document.createElement('div'); holder.innerHTML=header(); const fresh=holder.firstElementChild;
    if(!fresh)return;
    const old=document.querySelector('body > header.site-header, body > header.top, body > header, .site-header, header.top');
    if(old) old.replaceWith(fresh); else document.body.insertAdjacentElement('afterbegin',fresh);
  }
  function addAdminActions(){
    if(!isAdmin||path==='admin-home.html')return;
    // Pages such as Benefits/Finance/Settings already provide their own desktop actions.
    // Do not inject a second pair into the form/card area.
    if(document.querySelector('.head-actions,.settings-actions,[data-admin-actions="owned"],.titlebar > a[href*="admin-home.html"]')) return;
    document.querySelectorAll('.sk-admin-action-group').forEach(x=>x.remove());
    const group=document.createElement('div');group.className='sk-admin-action-group';
    const back=document.createElement('a');back.className='sk-admin-back-inline';back.href='admin-home.html?v='+V;back.textContent='🧩 ศูนย์จัดการระบบ';
    const lo=document.createElement('button');lo.type='button';lo.className='sk-admin-logout-inline';lo.textContent='ออกจากระบบ';lo.addEventListener('click',logout);
    group.append(back,lo);
    const main=document.querySelector('main'); if(!main)return;
    const title=main.querySelector('.titlebar,.page-title'); if(title){title.appendChild(group);return;}
    const heading=main.querySelector('h1.section-title,h2.section-title'); if(heading){const row=document.createElement('div');row.className='sk-admin-action-row';row.style.cssText='display:flex;align-items:center;gap:12px;margin:12px 0 14px';row.appendChild(group);heading.insertAdjacentElement('afterend',row);return;}
    const tabs=main.querySelector('.setting-tabs,.tabs,.subtabs'); if(tabs){tabs.appendChild(group);return;}
    const row=document.createElement('div');row.className='sk-admin-action-row';row.style.cssText='display:flex;justify-content:flex-end;align-items:center;margin:12px 0 14px';row.appendChild(group);main.insertAdjacentElement('afterbegin',row);
  }
  function publicModuleName(){const m={'index.html':'หน้าหลัก','register.html':'ลงทะเบียนศิษย์เก่า','status.html':'ตรวจสอบสถานะ','member.html':'ข้อมูลสมาชิก','benefits.html':'สิทธิประโยชน์','payment.html':'ชำระค่าสมาชิก','donation.html':'บริจาค','news.html':'ข่าวสาร'};return m[path]||'หน้าเว็บ';}
  function unifyPublicFooter(){
    if(!publicPages.has(path) && !isAdmin)return;
    document.querySelectorAll('footer,.sk-public-footer,.site-footer').forEach(x=>x.remove());
    const f=document.createElement('footer');f.className='sk-public-admin-footer';
    f.innerHTML=`<div class="sk-public-admin-footer__in"><div class="sk-public-admin-footer__brand"><img src="assets/association-logo.png?v=${V}" alt="โลโก้สมาคม"><div class="sk-public-admin-footer__text"><div class="sk-public-admin-footer__name">สมาคมศิษย์เก่านูรุ้ลอิสลามสัมพันธ์ (สุเหร่าเขียว)</div><div class="sk-public-admin-footer__values">🌙 ศรัทธา · 📚 ความรู้ · 💚 สายสัมพันธ์</div></div></div><div class="sk-public-admin-footer__copy">© 2026 SK Alumni Member System by KimhanIkals - ${isAdmin?'Admin Center':publicModuleName()} · V${V}</div></div>`;
    document.body.appendChild(f);
  }
  function ensureAdminHeadingIcon(){
    if(!isAdmin)return;
    const map={'admin.html':'👥','admin-finance.html':'💰','admin-receipts.html':'🧾','admin-content.html':'📣','admin-benefits.html':'🎁','admin-settings.html':'⚙️','admin-home.html':'🧩'};
    const icon=map[path];if(!icon)return;
    const h=document.querySelector('main h1,main h2.section-title,.module-headline h1,.titlebar h1,.titlebar h2');
    if(h&&!String(h.textContent||'').trim().startsWith(icon))h.textContent=icon+' '+String(h.textContent||'').trim();
  }
  function enhance(){
    try{
      if(isAdmin&&path!=='admin.html'&&!adminKey()){location.replace('admin.html?v='+V);return;}
      if(isAdmin)adminKey();
      if(publicPages.has(path)){document.body.classList.add('sk-public-page'); if(['benefits.html','news.html'].includes(path)){document.querySelector('main')?.classList.add('sk-public-content-frame')}}
      document.querySelectorAll('.v26-homebar,.v25-homebar,.homebtn').forEach(x=>x.remove());
      if(publicPages.has(path)||isAdmin) ensureHeader();
      addAdminActions();
      ensureAdminHeadingIcon();
      document.querySelectorAll('.sk-mobile-admin-logout').forEach(b=>b.addEventListener('click',logout));
      const headingMap={'register.html':['🧕🏻','ลงทะเบียนศิษย์เก่า'],'status.html':['🔎','ตรวจสอบสถานะ'],'benefits.html':['🎁','สิทธิประโยชน์'],'member.html':['🎁','สิทธิประโยชน์'],'payment.html':['💳','ชำระค่าสมาชิก'],'donation.html':['🤲🏻','บริจาค'],'news.html':['📣','ข่าวสาร']};
      document.querySelectorAll('.eyebrow').forEach(x=>x.classList.add('sk-module-badge'));const info=headingMap[path];if(info&&!document.querySelector('.sk-module-badge')){const h=document.querySelector('main .section-title, main h1');if(h)h.insertAdjacentHTML('beforebegin',`<div class="sk-module-badge">${info[0]} ${info[1]}</div>`)}
      if(typeof window.applyPublicSettings==='function'&&window.SK_SETTINGS)window.applyPublicSettings(window.SK_SETTINGS);
      unifyPublicFooter();
    }catch(err){console.error('[SK module nav]',err)}
  }
  window.SK_ADMIN_LOGOUT=logout;
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',enhance,{once:true});else enhance();
})();
