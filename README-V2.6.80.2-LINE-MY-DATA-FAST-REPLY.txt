SK Alumni System V2.6.81 – LINE My Data Fast Reply Fix

แก้ไข:
- คำสั่ง “ข้อมูลของฉัน” ตอบ LINE ทันทีโดยไม่ query PostgreSQL ก่อน Reply
- ใช้ signed line_token อายุ 10 นาที
- เมื่อผู้ใช้เปิด member.html จึงตรวจการผูก LINE กับสมาชิกจากฐานข้อมูล
- ถ้าผูกแล้วและสมาชิก Active ระบบเปิด Member Portal อัตโนมัติ
- ถ้ายังไม่ผูก/สถานะไม่ใช้งาน/Token หมดอายุ จะแสดงข้อความชัดเจน
- Sync เวอร์ชันหน้าเว็บเป็น V2.6.81
