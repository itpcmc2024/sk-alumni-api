SK Alumni System V2.6.21 – Module Page Recovery

แก้ไขหลัก
1. กู้หน้าโมดูลที่เปิดแล้วเหลือเพียงชื่อระบบ/หน้าขาว: สนับสนุนรายปี, สิทธิประโยชน์, บริจาค, ข่าวสาร และ Admin
2. เปลี่ยน cache-busting ของ shared assets เป็น V2.6.21 เพื่อไม่ให้ browser/GitHub Pages ใช้ site.js หรือ module-nav.js เก่าค้าง
3. ปรับ module-nav.js เป็น defensive enhancement: หากส่วน navigation ผิดพลาด จะไม่ลบหรือทำลายเนื้อหาหลักของหน้า
4. ปรับ public settings loader ให้ทำงานได้ทั้งก่อน/หลัง DOMContentLoaded และใช้ cache key ใหม่
5. เพิ่ม recovery CSS ให้ main content ยังคงแสดง แม้ shared enhancement มีปัญหา
6. คงฟังก์ชัน Finance / Receipt / Topic Sync จาก V2.6.19 เดิมทั้งหมด

ลำดับทดสอบหลัง Deploy
- index.html
- payment.html
- benefits.html
- donation.html
- news.html
- admin-home.html
- register.html
- status.html

แนะนำ Hard Refresh หลัง GitHub Pages Deploy สำเร็จ
Mac Chrome: Cmd + Shift + R
Windows Chrome: Ctrl + F5
