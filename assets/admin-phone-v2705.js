(()=>{
  const grid=document.querySelector('#sp-admins .settingsgrid');
  if(!grid)return;
  const box=document.createElement('div');box.className='field';
  box.innerHTML='<label>เบอร์โทรสำหรับสมาชิก</label><input id="aPhone" class="control" inputmode="tel" placeholder="เช่น 082333xxxx"><label style="display:flex;gap:7px;align-items:center;margin-top:6px"><input id="aPhoneEnabled" type="checkbox"> เปิดให้สมาชิกกดโทรเบอร์นี้</label>';
  grid.append(box);
  const P=()=>document.getElementById('aPhone'),E=()=>document.getElementById('aPhoneEnabled'),oldEdit=window.editAdminAccount;
  window.editAdminAccount=id=>{oldEdit(id);const x=ADMIN_ROWS.find(r=>String(r.admin_id)===String(id));P().value=x?.contact_phone||'';E().checked=!!x?.phone_enabled};
  saveAdminAccount.onclick=async()=>{const editing=!!aOriginalId.value.trim(),id=aId.value.trim(),name=aName.value.trim(),newKey=aKey.value.trim(),payload={new_admin_id:id,full_name:name,admin_key:newKey||undefined,role:aRole.value,active:(ADMIN_ROWS.find(x=>x.admin_id===aOriginalId.value)?.active!==false),contact_phone:P().value.trim(),phone_enabled:E().checked};if(!id||!name||(!editing&&newKey.length<8))return Swal.fire({icon:'warning',title:'กรอกข้อมูล Admin ให้ครบ'});try{if(editing)await api('/api/admin/accounts/'+encodeURIComponent(aOriginalId.value),{method:'PUT',headers:auth(),body:JSON.stringify(payload)});else await api('/api/admin/accounts',{method:'POST',headers:auth(),body:JSON.stringify({...payload,admin_id:id,admin_key:newKey})});resetAdminForm();P().value='';E().checked=false;await loadAdminAccounts();Swal.fire({icon:'success',title:'บันทึกแอดมินแล้ว',timer:900,showConfirmButton:false})}catch(err){Swal.fire({icon:'error',title:'บันทึกไม่สำเร็จ',text:err.message})}};
})();
