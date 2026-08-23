SK Alumni System V2.3 – Responsive Header + Register Module
==========================================================

รอบนี้แก้ตามคำขอ
1) ใช้โลโก้สมาคมจากรูปที่แนบล่าสุด
2) Desktop คง layout แบบเดิม:
   โลโก้/ชื่อระบบซ้าย + เมนูตรงกลาง + LINE ด้านขวา
3) Mobile เปลี่ยนเป็น:
   โลโก้กลาง
   ทะเบียนสมาชิกสมาคมศิษย์เก่า
   นูรุ้ลอิสลามสัมพันธ์ (สุเหร่าเขียว)
   SK Alumni Member System
   แล้วเมนู 2 แถว แถวละ 4
4) Mobile LINE ใช้รูป cute-line.jpg ที่แนบมา
5) Hero หน้าแรกใช้ “ภาพอย่างเดียว”
   ตัดข้อความ HTML ที่ซ้อนบนรูปออก เพราะภาพมีข้อความอยู่แล้ว
6) ไม่มีการ์ด Admin กลางหน้า
7) เดิน module ต่อ: register.html
   - รักษาฟังก์ชันเดิมทั้งหมด
   - Smart Address เดิม
   - validation email/phone เดิม
   - consent ก่อนส่งข้อมูลเดิม
   - API เดิม
   - เปลี่ยน branding/logo/footer เป็น Register V2.3

ไฟล์ที่ต้อง Replace/เพิ่ม
- index.html
- register.html
- assets/association-logo.jpg
- assets/cute-line.jpg
- assets/hero-v2.2.jpg
- assets/cute-register.jpg
- assets/cute-status.jpg
- assets/cute-payment.jpg
- assets/cute-donation.jpg
- assets/cute-benefits.jpg
- assets/cute-news.jpg

วิธีอัปเดตใน VS Code
1) แตก ZIP
2) Copy index.html, register.html และโฟลเดอร์ assets
3) Paste ไปที่ Documents/sk-alumni-api
4) เลือก Replace เมื่อถาม
5) VS Code > Source Control
6) Commit message:
   SK Alumni System V2.3 Responsive Header Register Module
7) Commit
8) ถ้า Sync แสดงทั้งลูกศรลง/ขึ้น ให้รันก่อน:
   git pull --rebase origin main
   แล้วจึง Sync Changes
9) เปิด GitHub Pages และ Hard Refresh

รอบนี้ไม่ต้อง
- รัน SQL
- แก้ src/index.js
- แก้ Cloudflare Bindings
