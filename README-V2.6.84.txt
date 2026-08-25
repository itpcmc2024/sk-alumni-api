SK Alumni System V2.6.85 – Responsive + LINE Inbox Reliability + UX

ปรับปรุงหลัก
1) แก้ Admin → LINE สมาชิกไม่พบข้อความ
   - บันทึกข้อความสมาชิกแบบ retry โดยไม่เรียก DDL ทุกครั้ง
   - กู้/Backfill ข้อความ "แอดมิน ..." จาก line_event_logs เข้า LINE Inbox อัตโนมัติ
   - แสดงจำนวนข้อความใหม่ และสถานะ "ใหม่"
   - เมื่อ Admin ตอบกลับ จะ mark ข้อความของสมาชิกเป็นอ่านแล้ว
2) Responsive / Mobile UX
   - หน้าตั้งค่าระบบ: ซ่อนปุ่ม ศูนย์จัดการระบบ/ออกจากระบบที่ซ้ำบนมือถือ
   - Desktop: ย้าย 2 ปุ่มไว้บรรทัดเดียวกับหัวข้อ ตั้งค่าระบบ
   - Finance mobile: ย้าย Refresh/CSV/Log/Navigator ลงใต้หัวข้อและเลื่อนแนวนอนได้
   - Gallery กิจกรรมหลายรูป: swipe/scroll ซ้าย-ขวาได้ พร้อมคำแนะนำ
   - Footer mobile: โลโก้เล็กลง อยู่หน้าชื่อสมาคม พร้อมกรอบวงกลม
3) Version Sync
   - Sync V2.6.85 ทั้ง UI/API/links
   - module-nav.js และ site.js จะปรับ query ?v=2.6.85 ใน address bar ให้ตรงกับเวอร์ชันปัจจุบันด้วย history.replaceState

ติดตั้ง
- นำไฟล์ทั้งหมดไปทับโฟลเดอร์ sk-alumni-api เดิม
- git add -A
- git commit -m "SK Alumni System V2.6.85 Responsive LINE Inbox UX"
- git push origin main
- npx.cmd wrangler deploy --dry-run
- หากไม่มี ERROR ให้ npx.cmd wrangler deploy

หมายเหตุ: Secrets LINE เดิมใช้ต่อได้ ไม่ต้องสร้างใหม่
