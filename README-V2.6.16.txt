SK Alumni System V2.6.16 – Receipt Center + DB Compatibility + Admin Tabs

สิ่งที่แก้ไข
1) แก้ Payment Internal server error จากฐานเดิมที่ payment_topics ยังไม่มี amount/updated_at ด้วย Worker self-healing + migration SQL
2) Settings Sync: APP_NAME / ค่าบำรุง / PromptPay / บัญชี ดึงแบบ no-store และหัวข้อ membership sync จาก Admin
3) ใบเสร็จ A4 แบบ 2 ส่วนในหน้าเดียว: ต้นฉบับด้านบน + สำเนาด้านล่าง พร้อมลายน้ำ
4) แสดงพิมพ์ครั้งที่ และวันที่พิมพ์
5) Admin Receipt Center: ดูใบเสร็จทั้งหมด เลือกหลายใบพิมพ์ครั้งเดียว และ Log ประวัติการพิมพ์
6) Admin Settings / Benefits / Content ใช้ Sub-TAB ลดการเลื่อนหน้าจอ

ติดตั้ง
- แทนที่ไฟล์ทั้งหมดใน repository
- Deploy Worker: npx wrangler deploy
- Push GitHub Pages
- Worker จะสร้าง/เติมโครงสร้าง V2.6.16 แบบ additive อัตโนมัติ หรือจะรัน sql/migrate-v2.6.16-receipt-center.sql ใน PG Studio ก่อนก็ได้

ทดสอบแนะนำ
A. /api/health ต้องขึ้น version 2.6.16
B. Admin Settings เปลี่ยนชื่อระบบและค่าบำรุง -> บันทึก -> เปิด payment.html ใหม่
C. Admin Finance -> ใบเสร็จ -> เลือกหลายรายการ -> พิมพ์ที่เลือก -> ตรวจ Log การพิมพ์
