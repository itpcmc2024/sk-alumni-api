SK Alumni System V2.6.24 – DOM Safe Module Recovery

แก้จาก V2.6.23 โดยตรง โดยไม่เปลี่ยน PostgreSQL / Worker API

จุดแก้หลัก
1. Shared site.js และ module-nav.js โหลดแบบ defer เพื่อลดการทำงานก่อน DOM พร้อม
2. เลิกอ้าง element จาก id เป็น global variable ใน news/donation/benefits/admin pages
3. payment.html เพิ่ม DOM boot guard และเริ่ม bind event หลัง DOMContentLoaded
4. เพิ่ม cache-busting เป็น v=2.6.24
5. คง backend src/index.js และฐานข้อมูลเดิม

วิธีติดตั้ง
- Copy ไฟล์ทั้งหมดในโฟลเดอร์นี้ทับ ROOT ของ repo sk-alumni-api
- Commit: SK Alumni System V2.6.24 – DOM Safe Module Recovery
- Push main และรอ GitHub Pages สำเร็จ
- ทดสอบด้วย ?v=2.6.24

ไม่ต้อง Run SQL และไม่ต้อง Deploy Cloudflare Worker
