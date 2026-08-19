
(()=>{
  const path=(location.pathname.split('/').pop()||'index.html').toLowerCase();
  const items=[
    ['index.html','🕌','หน้าแรก'],['register.html','🧕🏻','ลงทะเบียน'],['status.html','🔎','ตรวจสอบ'],
    ['member.html','🎁','สิทธิประโยชน์'],['donation.html','🤲🏻','บริจาค'],['news.html','📣','ข่าวสาร'],['admin-home.html','🌙','Admin']
  ];
  const active=(href)=>{
    if(path===href)return true;
    if(href==='member.html'&&path==='benefits.html')return true;
    if(href==='admin-home.html'&&path.startsWith('admin'))return true;
    return false;
  };
  function header(){return `<header class="sk-module-nav"><div class="sk-nav-wrap">
    <a class="sk-nav-brand" href="index.html"><img class="sk-nav-logo" src="assets/association-logo.png?v=2.6.18" alt="โลโก้สมาคม"><div><div class="sk-nav-title" data-app-name>ระบบสมาชิกสมาคมศิษย์เก่า นูรุ้ลอิสลามสัมพันธ์ (สุเหร่าเขียว)</div><div class="sk-nav-sub">🌙 Nurul Islam · SK Alumni Member System</div></div></a>
    <nav class="sk-nav-icons">${items.map(x=>`<a class="${active(x[0])?'active':''}" href="${x[0]}"><span class="ico">${x[1]}</span>${x[2]}</a>`).join('')}</nav>
    <div class="sk-mobile-home"><a href="index.html">🏠 หน้าแรก</a></div>
  </div></header>`}
  document.addEventListener('DOMContentLoaded',()=>{
    document.querySelectorAll('.v26-homebar,.v25-homebar,.homebtn').forEach(x=>x.remove());
    const old=document.querySelector('header.top');
    if(old) old.outerHTML=header(); else document.body.insertAdjacentHTML('afterbegin',header());
    if(path.startsWith('admin') && path!=='admin-home.html' && !document.querySelector('.sk-admin-backbar')){
      const bar=document.createElement('div');
      bar.className='sk-admin-backbar';
      bar.innerHTML='<div class="wrap"><a href="admin-home.html">← กลับศูนย์จัดการระบบ</a></div>';
      const head=document.querySelector('.sk-module-nav');
      if(head) head.insertAdjacentElement('afterend',bar);
    }
    const headingMap={
      'register.html':['🧕🏻','ลงทะเบียนศิษย์เก่า'],
      'status.html':['🔎','ตรวจสอบสถานะ'],
      'benefits.html':['🎁','สิทธิประโยชน์'],
      'member.html':['🎁','สิทธิประโยชน์'],
      'payment.html':['💳','ชำระค่าสมาชิก'],
      'donation.html':['🤲🏻','บริจาค'],
      'news.html':['📣','ข่าวสาร']
    };
    document.querySelectorAll('.eyebrow').forEach(x=>x.classList.add('sk-module-badge'));
    const info=headingMap[path];
    if(info && !document.querySelector('.sk-module-badge')){
      const h=document.querySelector('main .section-title, main h1');
      if(h){h.insertAdjacentHTML('beforebegin',`<div class="sk-module-badge">${info[0]} ${info[1]}</div>`)}
    }
  });
})();
