SK Alumni System V2.6.5 – Member Portal Stability

แก้ไขหลัก
- แก้ Internal server error ที่ POST /api/member/portal
- ต้นเหตุ V2.6.4: query เรียก benefit_usage ซึ่งบางฐานยังไม่มี และเรียก benefits.default_amount ซึ่ง schema ปัจจุบันไม่มี column นี้
- V2.6.5 แยก Payments / Donations / Benefit Usage / Benefits เป็นโมดูลอิสระ
- ถ้าโมดูลประวัติใดว่างหรือยังไม่มีตาราง หน้า Member Portal ยังเปิดและแสดงข้อมูลสมาชิกได้
- benefits ใช้เฉพาะ column ที่มีจริงใน schema V2.6
- เก็บ module_warnings ใน API response เพื่อวิเคราะห์ต่อได้โดยไม่ทำให้ผู้ใช้เจอหน้าล่ม
- คงระบบรูปสมาชิก, แก้ข้อมูลติดต่อ, บัตรสมาชิกดิจิทัล, Print/PDF และแท็บประวัติเดิม

ติดตั้ง
1. แตก ZIP
2. Copy ทั้งชุดไปทับ repo sk-alumni-api
3. ไม่ต้อง copy node_modules และไม่ต้องแก้ Aiven SQL สำหรับ hotfix นี้
4. Commit/Sync
5. Cloudflare auto deploy หรือ npx wrangler deploy
6. เปิด /api/health ต้องเห็น version 2.6.5
7. ทดสอบ Member Portal ด้วยสมาชิกสถานะ active

หมายเหตุ
- V2.6.5 ไม่ลบ/แก้ข้อมูลสมาชิกในฐาน
- benefit_usage จะคืน [] อัตโนมัติถ้ายังไม่มีตาราง และเราค่อยเปิด workflow การใช้สิทธิ์ในเฟสถัดไป
