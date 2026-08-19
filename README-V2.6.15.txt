SK Alumni System V2.6.17 – Receipt + Settings Sync

ปรับปรุงจาก V2.6.14
- จำกัดขนาดตัวอย่างสลิปใน Admin Transaction ให้พอดี และมีปุ่มเปิดรูปขนาดเต็ม
- เพิ่มระบบใบเสร็จรับเงินสำหรับรายการค่าบำรุงที่อนุมัติแล้ว พร้อมเลขที่ใบเสร็จและหน้าพิมพ์ A4
- รายการที่อนุมัติแล้วแสดงปุ่ม “ใบเสร็จ” ในตารางและหน้ารายละเอียด
- เพิ่ม API /api/admin/payments/:id/receipt สำหรับข้อมูลใบเสร็จ
- เพิ่ม receipt_no และ receipt_issued_at อัตโนมัติใน payments (สร้างย้อนหลังให้รายการที่อนุมัติแล้วด้วย)
- แก้การตั้งค่า APP_NAME และ MEMBERSHIP_FEE_YEARLY ให้ดึงใหม่แบบ no-cache
- Sync ยอดค่าบำรุงจาก Admin Settings ไปยังหัวข้อ membership และหน้า Payment
- Public header ที่เป็นชื่อระบบรองรับ APP_NAME จากการตั้งค่า

Deploy Worker: npx wrangler deploy
จากนั้น commit/push ทั้งชุดขึ้น GitHub Pages
