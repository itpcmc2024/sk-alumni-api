SK Alumni System V2.2 – Responsive Cute Portal
================================================

สิ่งที่ปรับ
- เอาการ์ด Admin กลางหน้าออก เหลือ Admin ที่เมนูด้านบน
- Header แบบ responsive ใหม่:
  โลโก้อยู่กึ่งกลาง
  ทะเบียนสมาชิกสมาคมศิษย์เก่า
  นูรุ้ลอิสลามสัมพันธ์ (สุเหร่าเขียว)
  SK Alumni Member System
- เมนูจัดเป็น 2 แถว แถวละ 4:
  หน้าแรก / ลงทะเบียน / ตรวจสอบสถานะ / สิทธิประโยชน์
  บริจาค / ข่าวสาร / Admin / ลงทะเบียนผ่าน LINE
- การ์ดกลางหน้าเหลือ 6 การ์ดสำหรับผู้ใช้งาน
- ใช้รูปที่ผู้ใช้ส่งมาแทนภาพการ์ดเดิม
- Hero ใช้ ref-hero ที่ผู้ใช้ส่งมา
- Responsive รองรับ Desktop / Tablet / Mobile
- Footer แสดง Public Home V2.2

วิธีอัปเดต
1. แตก ZIP
2. Copy index.html และโฟลเดอร์ assets จากแพ็กเกจนี้
3. ไป Finder > Documents > sk-alumni-api
4. Paste
5. ถ้าถามไฟล์ซ้ำ ให้ Replace
6. VS Code > Source Control
7. ตรวจ index.html = M และรูปใหม่ = U/M
8. Commit message:
   SK Alumni System V2.2 Responsive Cute Portal
9. Commit
10. Sync Changes / Push

รอบนี้
- ไม่ต้องรัน SQL
- ไม่ต้องแก้ src/index.js
- ไม่ต้องแก้ Cloudflare Worker/Bindings
