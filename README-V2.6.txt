SK Alumni System V2.6 – API Recovery + Optional Member Photo
===========================================================

เหตุผลของ V2.6
- จากการทดสอบ V2.5 ทุกหน้าที่เรียก API ขึ้น "Failed to fetch"
- V2.6 ปรับ Worker ให้ตอบ CORS สำหรับหน้าเว็บแบบ static ได้ตรงไปตรงมา
- ย้ายการเริ่มเชื่อมฐานข้อมูลเข้า try/catch เพื่อไม่ให้ runtime error กลายเป็น Failed to fetch แบบไม่มีรายละเอียด
- เพิ่ม timeout/error message ที่อ่านเข้าใจง่ายในหน้าเว็บ

สิ่งที่เพิ่ม
- หน้าลงทะเบียน: รูปสมาชิก "ไม่บังคับ"
- รับ JPG / PNG / WEBP
- ไฟล์ต้นฉบับไม่เกิน 5 MB
- Browser ย่อรูปให้ด้านยาวไม่เกิน 720 px
- แปลง WEBP และพยายามคุมขนาดประมาณไม่เกิน 240–320 KB
- เก็บใน members.photo_data เพื่อใช้กับ Member Portal / Admin และเตรียมใช้พิมพ์ใบสมัคร
- เอาคำว่า "· หน้าแรก" ออกจากหัวหน้าลงทะเบียน

โมดูลที่เดินต่อ
- Admin รายละเอียดสมาชิกแสดงรูปสมาชิก (ถ้ามี)
- Member Portal แสดงรูปสมาชิก (ถ้ามี)
- Benefits / News / Status / Register ใช้ error handling API แบบใหม่
- Version ทุกส่วนเป็น V2.6

ต้องทำเพิ่ม 1 ครั้งกับ PostgreSQL
รัน:
  psql "<SERVICE URI>" -f sql/migrate-v2.6-photo.sql

หรือเมื่ออยู่ใน psql:
  \i /Users/<ชื่อผู้ใช้>/Documents/sk-alumni-api/sql/migrate-v2.6-photo.sql

จากนั้น Deploy Worker ใหม่ให้ src/index.js V2.6 ขึ้น Cloudflare
และ Push GitHub Pages ตามปกติ

ลำดับทดสอบหลัง Deploy
1. เปิด https://sk-alumni-api.itpcmc2024.workers.dev/
   ต้องเห็น version 2.6.0
2. เปิด /api/health
3. เปิด /api/news
4. ทดสอบ register.html สมัคร 1 ราย
5. status.html ตรวจรหัส
6. admin.html อนุมัติ
7. member.html login
8. benefits.html / news.html

Commit message:
SK Alumni System V2.6 API Recovery Optional Member Photo
