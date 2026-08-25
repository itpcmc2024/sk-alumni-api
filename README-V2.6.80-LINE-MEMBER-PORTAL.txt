SK Alumni System V2.6.80 – LINE Member Linking + Member Portal
===============================================================

ฐานพัฒนา: V2.6.79.2 – LINE Fast Command Reply Fix

สิ่งที่แก้/เพิ่ม
1. แก้สาเหตุคำสั่ง “เชื่อมบัญชี” ตอบว่าไม่สามารถสร้างลิงก์ได้: เพิ่ม helper linkedLineMember, createLineLinkToken และ lineMemberName ที่ขาดหายไปใน V2.6.79.2
2. createLineLinkToken จะสร้าง/อัปเดต line_users ก่อนออก token จึงไม่ขึ้นกับ event logger ที่ทำงานภายหลัง
3. token เชื่อมบัญชีเป็น one-time token อายุ 15 นาที และ token เก่าที่ยังไม่ใช้ของ LINE เดียวกันจะถูกปิดก่อนสร้างใหม่
4. ยืนยันสมาชิกด้วย รหัสสมาชิก + อีเมล/เบอร์โทรเดิม และอนุญาตเฉพาะสมาชิกสถานะ active
5. ป้องกันสมาชิกหนึ่งรหัสเชื่อมกับ LINE active มากกว่าหนึ่งบัญชี ทั้งจาก line_users และ members.line_user_id
6. เมื่อเชื่อมสำเร็จจะ sync line_users.member_code และ members.line_user_id พร้อมล้าง stale link ของ LINE user เดิม
7. คำสั่ง “ข้อมูลของฉัน” ใช้การเชื่อมบัญชีเพื่อสร้างลิงก์ Member Portal อายุ 10 นาที
8. เมนู LINE แสดงทั้ง “เชื่อมบัญชี” และ “ข้อมูลของฉัน” โดยไม่ query DB เพื่อรักษาความเร็วและเสถียรภาพของ replyToken
9. Sync version runtime เป็น V2.6.80 รวม package.json/package-lock.json

ขั้นตอนทดสอบ
- Deploy Worker: npx.cmd wrangler deploy
- LINE: พิมพ์ “เชื่อมบัญชี”
- เปิดลิงก์ที่ได้รับ > กรอกรหัสสมาชิก active + อีเมลหรือเบอร์โทรที่ตรงฐานข้อมูล > เชื่อมบัญชี LINE
- กลับ LINE พิมพ์ “ข้อมูลของฉัน” > ต้องได้ลิงก์ Member Portal
- ทดสอบ “เชื่อมบัญชี” ซ้ำ > ต้องแจ้งว่า LINE นี้เชื่อมกับสมาชิกอยู่แล้ว

หมายเหตุ
- Secrets LINE_CHANNEL_ACCESS_TOKEN และ LINE_CHANNEL_SECRET ใช้ของเดิมใน Cloudflare ไม่ต้องใส่ลง Git
- การเปลี่ยน/ยกเลิกการเชื่อมบัญชีจะทำผ่าน Admin ในเฟสจัดการ LINE ต่อไป เพื่อป้องกันการยกเลิกโดยไม่ตั้งใจ
