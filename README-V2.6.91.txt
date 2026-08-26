SK Alumni System V2.6.92 – LINE Inbox Reliability + Storage Management

- ป้องกันข้อความ LINE ซ้ำด้วย webhookEventId / LINE message ID
- Auto refresh ไม่ล้างข้อความที่ Admin กำลังพิมพ์ และเก็บ draft ใน session
- เปิดห้องแล้ว mark read อัตโนมัติ
- ดึงชื่อและรูปโปรไฟล์ LINE มาแสดงในห้องสนทนา
- ซ่อน LINE User ID จากรายการห้องด้านซ้าย แต่คง LINE ID เต็มในหัวห้องพร้อม Copy
- เพิ่มแท็บจัดการข้อมูล LINE: ลบข้อความ, เคลียร์รูป/ไฟล์ที่เลือก, เคลียร์สื่อ/ข้อความเก่าตามจำนวนวัน
- หน้า Admin สมาชิก แสดง LINE ID ใต้ชื่อสมาชิกเพื่อเห็นสถานะการเชื่อมบัญชี
- จอเล็กหน้า Admin Center มีปุ่มออกจากระบบต่อจากหน้าแรก

หมายเหตุ: LINE OA Manager chat history ไม่สามารถดึงย้อนหลังทั้งห้องผ่าน Messaging API ได้ ระบบนี้จึงเก็บเฉพาะข้อมูลที่เข้าผ่าน Webhook/ส่งจากระบบของเราเอง
