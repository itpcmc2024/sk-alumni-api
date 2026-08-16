SK Alumni System V2.6.7 – Smart Address + Member Edit History + Certificate Polish

ปรับปรุงหลัก:
1. Member Portal: Smart Address กลับมาใช้งาน โดยเรียงฟิลด์ ตำบล/แขวง, อำเภอ/เขต, จังหวัด, รหัสไปรษณีย์
2. เพิ่ม TAB ประวัติการแก้ไขสมาชิก และบันทึก log ทุกครั้งที่ข้อมูลหรือรูปสมาชิกเปลี่ยน
3. Duplicate rule ยังคงเป็น ชื่อ + นามสกุล + อีเมล
4. หลักฐานการเป็นสมาชิก A4:
   - เบอร์โทรรูปแบบ 099-xxxxxxx
   - เวลาเริ่ม/สิ้นสุดสมาชิกเติม “น.”
   - ข้อความรับรองอยู่ใต้ที่อยู่และพยายามคงบรรทัดเดียว
   - ลายเซ็น: สมาชิกซ้าย / ประธานกลางต่ำลง / เจ้าหน้าที่ผู้ตรวจสอบขวา
   - วันเวลาพิมพ์ซ้ายล่าง และ copyright ขวาล่าง
5. API /api/member/portal ส่ง edit_history เพิ่ม
6. /api/member/update สร้าง member_edit_history อัตโนมัติเมื่อจำเป็น ไม่ต้องรัน SQL แยก
7. /api/health version = 2.6.7

การติดตั้ง:
- Copy ทั้งโฟลเดอร์ทับ repo sk-alumni-api
- Commit/Sync
- รอ Cloudflare Worker deploy
- ตรวจ /api/health ต้องเห็น 2.6.7
