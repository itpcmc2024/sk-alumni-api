SK Alumni System V2.4 – Theme Fix + Global Modules
====================================================

แก้ไขรอบนี้
- Hero หน้า Home เพิ่มความสูงและ crop ขอบภาพให้แนบเต็มกรอบ
- Mobile Hero โฟกัสบริเวณกลาง-ซ้ายที่เป็นข้อความสำคัญในรูป
- Footer Mobile จัดกึ่งกลางทั้งหมด
- โลโก้ Footer เปลี่ยนเป็น PNG โปร่งใส ไม่มีพื้นขาว + วงแหวน/เงาให้เด่นขึ้น
- เพิ่มปุ่ม “← กลับหน้าหลัก” ให้ทุกโมดูล
- แก้ปัญหารูปไม่ขึ้นโดยใส่ assets ที่จำเป็นทั้งหมดไว้ใน ZIP รอบนี้
- รักษา Register module V2.3 เดิม แล้วอัปเวอร์ชันเป็น V2.4
- เดินต่อ Status module: เพิ่มทางไป Member Portal เมื่อสมาชิกได้รับอนุมัติ
- รวมไฟล์ทุกโมดูลจาก Full Web foundation มาให้ครบในแพ็กเดียว

สำคัญมาก — วิธีวางไฟล์รอบนี้
1) แตก ZIP
2) เปิดโฟลเดอร์ SK-Alumni-System-V2.4-Theme-Fix-Global-Modules
3) Select All “ไฟล์และโฟลเดอร์ทั้งหมดภายใน”
4) Copy
5) ไป Documents/sk-alumni-api
6) Paste
7) เลือก Replace / Merge เมื่อ macOS ถาม

ต้องให้โฟลเดอร์ assets มีอย่างน้อย:
- association-logo.png
- association-logo.jpg
- hero-main.jpg
- cute-register.jpg
- cute-status.jpg
- cute-payment.jpg
- cute-donation.jpg
- cute-benefits.jpg
- cute-news.jpg
- cute-line.jpg
- site.css
- site.js
- mosque-reference.jpg

จากนั้นใน VS Code
- Source Control
- Commit message:
  SK Alumni System V2.4 Theme Fix Global Modules
- Commit
- ถ้ามีทั้งลูกศรลงและขึ้น ให้รัน:
  git pull --rebase origin main
- จากนั้น Sync Changes

ไม่ต้องรัน SQL เพิ่มใน V2.4
ไม่ต้องแก้ Cloudflare bindings
ไม่ต้องแก้ฐานข้อมูล

หลัง Push:
- เปิด GitHub Pages
- Hard Refresh: Cmd + Shift + R
- ทดสอบ index.html / register.html / status.html
