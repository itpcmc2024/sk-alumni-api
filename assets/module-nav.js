(()=>{
  'use strict';
  const path=(location.pathname.split('/').pop()||'index.html').toLowerCase();
  const items=[
    ['index.html','🕌','หน้าแรก'],['register.html','🧕🏻','ลงทะเบียน'],['status.html','🔎','ตรวจสอบ'],
    ['member.html','🎁','สิทธิประโยชน์'],['donation.html','🤲🏻','บริจาค'],['news.html','📣','ข่าวสาร'],['admin-home.html','🌙','Admin']
  ];
  const active=(href)=> path===href || (href==='member.html'&&path==='benefits.html') || (href==='admin-home.html'&&path.startsWith('admin'));
  const header=()=>`<header class="sk-module-nav" data-sk-nav="v2.6.26"><div class="sk-nav-wrap">
    <a class="sk-nav-brand" href="index.html?v=2.6.26"><img class="sk-nav-logo" src="assets/association-logo.png?v=2.6.26" alt="โลโก้สมาคม"><div><div class="sk-nav-title" data-app-name><span class="sk-app-line">ระบบสมาชิกสมาคมศิษย์เก่า</span><span class="sk-app-line">นูรุ้ลอิสลามสัมพันธ์ (สุเหร่าเขียว)</span></div><div class="sk-nav-sub">🌙 Nurul Islam · SK Alumni Member System</div></div></a>
    <nav class="sk-nav-icons">${items.map(x=>`<a class="${active(x[0])?'active':''}" href="${x[0]}?v=2.6.26"><span class="ico">${x[1]}</span>${x[2]}</a>`).join('')}</nav>
    <div class="sk-mobile-home"><a href="index.html?v=2.6.26">🏠 หน้าแรก</a>${path.startsWith('admin')&&path!=='admin-home.html'?'<a class="sk-mobile-admin-back" href="admin-home.html">← กลับศูนย์จัดการระบบ</a>':''}</div>
  </div></header>`;

  function enhance(){
    try{
      document.querySelectorAll('.v26-homebar,.v25-homebar,.homebtn').forEach(x=>x.remove());
      if(!document.querySelector('[data-sk-nav="v2.6.26"]')){
        const old=document.querySelector('header.top');
        if(old){
          const holder=document.createElement('div'); holder.innerHTML=header();
          const fresh=holder.firstElementChild;
          if(fresh) old.replaceWith(fresh);
        }else{
          document.body.insertAdjacentHTML('afterbegin',header());
        }
      }
      if(path.startsWith('admin') && path!=='admin-home.html' && !document.querySelector('.sk-admin-back-inline')){
        const main=document.querySelector('main');
        const tabs=main?.querySelector('.setting-tabs,.tabs,.subtabs');
        if(main){const a=document.createElement('a');a.className='sk-admin-back-inline';a.href='admin-home.html?v=2.6.26';a.textContent='← กลับศูนย์จัดการระบบ';if(tabs){tabs.classList.add('sk-tabs-with-back');tabs.appendChild(a)}else main.insertAdjacentElement('afterbegin',a)}
      }
      const headingMap={'register.html':['🧕🏻','ลงทะเบียนศิษย์เก่า'],'status.html':['🔎','ตรวจสอบสถานะ'],'benefits.html':['🎁','สิทธิประโยชน์'],'member.html':['🎁','สิทธิประโยชน์'],'payment.html':['💳','ชำระค่าสมาชิก'],'donation.html':['🤲🏻','บริจาค'],'news.html':['📣','ข่าวสาร']};
      document.querySelectorAll('.eyebrow').forEach(x=>x.classList.add('sk-module-badge'));
      const info=headingMap[path];
      if(info && !document.querySelector('.sk-module-badge')){const h=document.querySelector('main .section-title, main h1');if(h)h.insertAdjacentHTML('beforebegin',`<div class="sk-module-badge">${info[0]} ${info[1]}</div>`)}
      if(typeof window.applyPublicSettings==='function' && window.SK_SETTINGS) window.applyPublicSettings(window.SK_SETTINGS);
    }catch(err){console.error('[SK module nav recovery]',err)}
  }
  if(document.readyState==='loading') document.addEventListener('DOMContentLoaded',enhance,{once:true}); else enhance();
})();
