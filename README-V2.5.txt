SK Alumni System V2.5 – Mobile Polish + Member Benefits
======================================================

แก้ตามคำขอ
1. Footer จอเล็ก
   - โลโก้อยู่ซ้าย ข้อความสมาคมอยู่ด้านขวา
   - ทั้งกลุ่มอยู่กึ่งกลางหน้าจอ
   - copyright อยู่กึ่งกลางด้านล่าง
   - โลโก้ไม่มีพื้นขาวและมีวงแหวน/เงา

2. ปุ่ม “← กลับหน้าหลัก”
   - ย้ายไปด้านขวาในทุกโมดูล
   - Desktop และ Mobile ใช้ตำแหน่งเดียวกัน

3. Hero หน้า Home บนจอเล็ก
   - เพิ่มไฟล์ assets/hero-mobile-text.jpg
   - เป็น crop จากภาพเดิมของผู้ใช้
   - แสดงส่วนข้อความในภาพให้ครบมากกว่าการใช้ object-fit: cover
   - Desktop ยังคงใช้ภาพเต็มเดิม

4. เดินโมดูลต่อ
   - Member Portal เชื่อม /api/benefits แล้ว
   - หลัง Login สมาชิกสำเร็จ ระบบโหลดสิทธิประโยชน์ที่ active มาแสดงจริง
   - Status → Member Portal flow เดิมยังคงทำงาน
   - Benefits public page ยังคงโหลด API เดิม
   - Version ของ shared module เปลี่ยนเป็น V2.5

วิธีอัปเดต
1) แตก ZIP
2) Copy ทุกไฟล์และทุกโฟลเดอร์ภายใน
3) Paste ไปที่ Documents/sk-alumni-api
4) เลือก Replace / Merge
5) VS Code > Source Control
6) Commit message:
   SK Alumni System V2.5 Mobile Polish Member Benefits
7) Commit
8) หากมีทั้งลูกศรลงและขึ้น:
   git pull --rebase origin main
9) Sync Changes
10) GitHub Pages: Cmd + Shift + R

ไม่ต้องรัน SQL
ไม่ต้องแก้ Cloudflare Bindings
ไม่ต้องแก้ PostgreSQL
