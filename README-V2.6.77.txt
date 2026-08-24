SK Alumni System V2.6.78 – Admin Layout + Responsive + Performance Polish

ปรับปรุงจาก V2.6.76
- ย้ายปุ่ม ศูนย์จัดการระบบ / ออกจากระบบ ของหน้า จัดการใบเสร็จ ไปมุมขวาบนระดับเดียวกับหัวข้อ ตามแนวทางหน้า ศูนย์ตรวจสอบธุรกรรม
- ปรับ Responsive ของหน้าใบเสร็จ โดยเฉพาะ TAB เล่มใบเสร็จ/รายงาน/Log ให้ใช้งานได้บน Desktop, Laptop, Tablet และ Mobile
- แก้ปุ่ม + เพิ่มเล่มใบเสร็จ ไม่ให้ล้นหรือถูกตัดบนจอเล็ก
- ปรับ toolbar, navigator, table scroll และ tabs ให้ยืด/ตัดบรรทัดอย่างเหมาะสม
- ปรับหน้า จัดการใบเสร็จ ให้โหลดข้อมูลแบบ Lazy Load ตาม TAB ลด API request ตอนเปิดหน้าเริ่มต้น
- รีเฟรชเฉพาะข้อมูลของ TAB ที่กำลังใช้งาน ลด request ที่ไม่จำเป็น
- ลบ README/DEPLOY เวอร์ชันเก่าจากแพ็กเกจ deploy เพื่อลดความรก โดยไม่แตะ SQL migration และไฟล์ runtime ที่จำเป็น
- Sync runtime/query/footer/assets เป็น V2.6.78

Deploy:
git add -A
git commit -m "SK Alumni System V2.6.78 Admin Layout Responsive Performance Polish"
git push origin main
npx wrangler deploy
