SK Alumni System V1.7 – Pastel Light Admin
Generated: 2026-08-15

สิ่งที่เปลี่ยนในเวอร์ชันนี้
- คงหน้า register.html จาก V1.6 (Cute Pastel Quote Row) ไว้เหมือนเดิม
- ปรับ admin.html เป็นโทน Pastel Light สว่าง อ่านง่าย
- การ์ดสถิติ: ฟ้าอ่อน / เหลืองอ่อน / เขียวมิ้นต์ / ชมพูอ่อน
- ตารางสมาชิกพื้นขาว อ่านง่าย และ Responsive ด้วย horizontal scroll
- Modal รายละเอียดสมาชิกพื้นสว่าง พร้อมปุ่มอนุมัติ/ยกเลิก/บันทึก
- Admin API Key ไม่ฝังในไฟล์ HTML; กรอกผ่านหน้าล็อกอินและเลือกจำคีย์ได้
- รองรับ API response ได้หลายรูปแบบ และมี fallback endpoint สำหรับระบบปัจจุบัน

วิธีอัปเดตแบบปลอดภัย
1) ใน GitHub repository sk-alumni-api ให้แทนที่เฉพาะ admin.html ก่อน
2) ไม่จำเป็นต้องแทนที่ register.html ถ้า V1.6 ใช้งานดีอยู่แล้ว
3) assets เดิมใช้ต่อได้ โดยเฉพาะ assets/association-logo.jpg
4) Commit changes
5) เปิด .../sk-alumni-api/admin.html แล้วกด Command + Shift + R บน Mac
6) Login ด้วย Admin API Key เดิม

หมายเหตุ
- หาก Admin API เดิมของ Worker ใช้ endpoint ที่ต่างจาก fallback ที่หน้าเว็บรองรับ ระบบจะแจ้ง error ชัดเจนโดยไม่แก้ฐานข้อมูลเอง
- ไม่มีการเปลี่ยน PostgreSQL schema หรือ Worker API ในแพ็กนี้
