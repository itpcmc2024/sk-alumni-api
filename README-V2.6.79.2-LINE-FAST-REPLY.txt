SK Alumni System V2.6.79.2 – LINE Fast Command Reply Fix

เหตุผล:
V2.6.79/79.1 เริ่มทำ database/schema work ก่อนส่ง reply ให้ LINE
ซึ่งอาจทำให้ replyToken ถูกใช้ช้าและผู้ใช้เห็นอาการพิมพ์ “เมนู” แล้วเงียบ

แก้ไข:
- follow และคำสั่งพื้นฐานตอบ LINE ก่อนแตะฐานข้อมูล
- เมนู / ลงทะเบียน / ตรวจสอบสถานะ / สมาชิก / สิทธิประโยชน์ / ติดต่อแอดมิน ใช้ fast path
- Event log ทำหลังส่ง reply และ error ของ log ไม่บล็อกข้อความ
- Account Linking ยังทำงานเฉพาะคำสั่ง เชื่อมบัญชี / ข้อมูลของฉัน
- เพิ่ม GET /api/line/health สำหรับตรวจ config โดยไม่เปิดเผย secret

หลัง deploy:
1. เปิด /api/line/health ต้อง version 2.6.79.2 และ secret/token configured = true
2. พิมพ์ เมนู 3 ครั้งติดกัน
3. ทดสอบ ลงทะเบียน / ตรวจสอบสถานะ / สิทธิประโยชน์ / ติดต่อแอดมิน
4. ถ้าผ่าน ค่อยทดสอบ เชื่อมบัญชี
