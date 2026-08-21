SK Alumni Member System V2.6.36 – Admin Layout Recovery Fix

แก้ไขจาก V2.6.35 แบบเฉพาะจุด
- แก้หน้า admin.html ที่โลโก้แสดงขนาดใหญ่มากและดันเนื้อหาหน้าจอ
- สาเหตุ: admin.html โหลด assets/module-nav.js แต่ไม่ได้โหลด assets/module-nav.css
- เพิ่ม module-nav.css ให้ admin.html และทำ cache-bust เป็น v=2.6.36
- ไม่แก้โครงสร้าง API, สมาชิก, สถานะ, การพิมพ์ หรือฐานข้อมูล

ไฟล์ที่แก้หลัก: admin.html
