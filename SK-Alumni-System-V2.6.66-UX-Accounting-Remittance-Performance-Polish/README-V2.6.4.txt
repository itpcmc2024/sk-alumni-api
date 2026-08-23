SK Alumni System V2.6.5 – Member Code + Photo + Full Member Portal
=====================================================================

แก้ไขจาก V2.6.3
1. คืนฟังก์ชันเลือกรูปสมาชิกในหน้าลงทะเบียน
   - ไม่บังคับ
   - รองรับ JPG / PNG / WEBP
   - ไฟล์ต้นฉบับไม่เกิน 5 MB
   - ย่อเป็น WEBP อัตโนมัติและควบคุมขนาดก่อนส่ง API

2. แก้ Member Code
   - รูปแบบ YY-SK0001 เช่น 69-SK0001
   - นับเฉพาะรหัสที่ถูกต้องรูปแบบ YY-SK + เลข 4 หลัก
   - รหัสผิดเดิม เช่น 69-SK690005 จะไม่ถูกนำไปคำนวณเลขถัดไป
   - เปลี่ยนปี พ.ศ. แล้วเริ่มเลขใหม่จาก 0001
   - มี SQL สำหรับแก้ข้อมูลผิดเดิม: sql/V2.6.5-fix-member-codes.sql

3. Member Portal / สิทธิประโยชน์สมาชิก
   - Login ด้วยรหัสสมาชิก + Email/โทรศัพท์
   - แสดงรูปสมาชิก ชื่อ รหัส และสถานะ
   - Summary: ชำระค่าสมาชิกสะสม / บริจาคสะสม / จำนวนครั้งใช้สิทธิ
   - บัตรสมาชิกดิจิทัล + พิมพ์/PDF
   - หลักฐานการเป็นสมาชิก + พิมพ์/PDF
   - เปลี่ยนรูปสมาชิก
   - แก้ไขเบอร์โทร / Email
   - Tabs: ข้อมูลส่วนตัว / ประวัติชำระ / ประวัติบริจาค /
           ประวัติสิทธิประโยชน์ / สิทธิประโยชน์ที่ใช้ได้
   - Logout

ไฟล์สำคัญที่เปลี่ยน
- src/index.js
- register.html
- status.html
- member.html
- package.json
- .gitignore
- sql/V2.6.5-fix-member-codes.sql

ขั้นตอนติดตั้ง
A) แตก ZIP แล้ว Copy ทุกไฟล์ไปทับ repo sk-alumni-api
B) อย่า Copy node_modules และอย่า Commit node_modules
C) Commit:
   SK Alumni System V2.6.5 Member Code Photo Full Portal
D) Sync / Push
E) Cloudflare:
   npm install
   npx wrangler deploy
   (หรือปล่อย Auto Deploy หากตั้งไว้)
F) ทดสอบ /api/health ต้องแสดง version 2.6.5

การแก้รหัสสมาชิกที่ผิดอยู่แล้ว
- หลัง deploy สำเร็จ เปิด Aiven PG Studio
- เปิด sql/V2.6.5-fix-member-codes.sql
- Run 1 ครั้ง
- ตัวอย่าง 69-SK690005 -> 69-SK0005 และ 69-SK690006 -> 69-SK0006
- Script จะย้าย FK ที่อ้าง member_code ให้อัตโนมัติ

ลำดับทดสอบ
1) /api/health = 2.6.5
2) Run SQL fix member codes (ถ้ามีรหัส 69-SK69xxxx)
3) สมัครใหม่พร้อม/ไม่พร้อมรูป
4) ตรวจว่ารหัสใหม่ต่อจาก 69-SK0006 เป็น 69-SK0007
5) Admin เปลี่ยนสถานะเป็น active
6) Status -> เข้าสู่สิทธิประโยชน์สมาชิก
7) Login Member Portal และทดสอบทุก Tab / เปลี่ยนรูป / แก้เบอร์หรือ Email
