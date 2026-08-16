
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
    <a class="sk-nav-brand" href="index.html"><img class="sk-nav-logo" src="assets/association-logo.png" alt="โลโก้สมาคม"><div><div class="sk-nav-title">ระบบสมาชิกสมาคมศิษย์เก่า<br>นูรุ้ลอิสลามสัมพันธ์ (สุเหร่าเขียว)</div><div class="sk-nav-sub">🌙 Nurul Islam · SK Alumni Member System</div></div></a>
    <nav class="sk-nav-icons">${items.map(x=>`<a class="${active(x[0])?'active':''}" href="${x[0]}"><span class="ico">${x[1]}</span>${x[2]}</a>`).join('')}</nav>
    <div class="sk-mobile-home"><a href="index.html">🏠 หน้าแรก</a></div>
  </div></header>`}
  document.addEventListener('DOMContentLoaded',()=>{
    document.querySelectorAll('.v26-homebar,.v25-homebar,.homebtn').forEach(x=>x.remove());
    const old=document.querySelector('header.top');
    if(old) old.outerHTML=header(); else document.body.insertAdjacentHTML('afterbegin',header());
  });
})();
