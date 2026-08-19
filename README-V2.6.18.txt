SK Alumni System V2.6.19 – Finance Stability + Drag Admin + Receipt Stamp

ปรับปรุงจาก V2.6.17
1. หน้า Payment/สนับสนุนรายปี cache-bust assets และเลือกหัวข้อค่าบำรุงหลักอัตโนมัติ เพื่อให้ยอดและ QR แสดงทันที
2. ชื่อระบบบังคับจัด 2 บรรทัด: ระบบสมาชิกสมาคมศิษย์เก่า / นูรุ้ลอิสลามสัมพันธ์ (สุเหร่าเขียว) พร้อมบรรทัด Nurul Islam เดิม
3. Admin Center ใช้ Drag & Drop โดยตรง ไม่มีปุ่มลูกศรขึ้นลง
4. Admin modules เพิ่มปุ่ม “กลับศูนย์จัดการระบบ”
5. Settings เพิ่มอัปโหลดตราสมาคมสำหรับใบเสร็จ; ถ้าไม่กำหนดใช้โลโก้สมาคมอัตโนมัติ
6. หัวข้อค่าบำรุง/สนับสนุนเพิ่มปุ่มลบแบบปลอดภัย: ลบได้เมื่อไม่มีประวัติอ้างอิง มิฉะนั้นให้ปิดใช้งาน
7. Receipt เพิ่มคำว่า “จำนวนเงิน” หน้าเลขจำนวนเงินตัวอักษร ปรับขนาดบรรทัดรับชำระ/ตรวจสอบให้เท่ากัน และใช้ตราสมาคมจาก Settings
8. Receipt Center และ Print Log เพิ่มเรียง ใหม่→เก่า / เก่า→ใหม่, จำนวนแถวต่อหน้า และ pagination
9. API /api/health และ APP_VERSION เป็น 2.6.19

Deploy Worker:
npx wrangler deploy
ตรวจ /api/health ต้องเห็น version 2.6.19

GitHub:
git add .
git commit -m "SK Alumni System V2.6.19 - Finance Stability Drag Admin Receipt Stamp"
git pull --rebase origin main
git push origin main
