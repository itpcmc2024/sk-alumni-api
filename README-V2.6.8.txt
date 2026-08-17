SK Alumni System V2.6.8 – Auto Address + Reliable Edit History

ปรับปรุงจาก V2.6.7:
1. หน้าแก้ไขข้อมูลส่วนตัวเพิ่มคำแนะนำ Smart Address: เลือกรหัสไปรษณีย์ก่อน แล้วเลือกตำบล/แขวง
2. ประวัติการแก้ไข refresh อัตโนมัติหลังบันทึกข้อมูลและหลังเปลี่ยนรูปสมาชิก
3. เมื่อเปิด TAB ประวัติการแก้ไข ระบบดึงข้อมูลล่าสุดจาก API อีกครั้ง
4. เพิ่ม API /api/member/edit-history สำหรับโหลด history โดยตรง ลดภาระจาก Member Portal
5. เพิ่มการจัดเรียง ใหม่→เก่า / เก่า→ใหม่
6. เลือกจำนวนแถว 5 / 10 / 20 / 50 / ทั้งหมด และแสดงจำนวนรายการ
7. API /api/health version = 2.6.8

การติดตั้ง:
- Copy ทั้งโฟลเดอร์ทับ repo sk-alumni-api
- ห้ามนำ node_modules ขึ้น Git
- Commit/Sync
- รอ Cloudflare Worker deploy
- ตรวจ /api/health ต้องเห็น 2.6.8
