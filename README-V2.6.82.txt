SK Alumni System V2.6.82 – Responsive UI + LINE Member Notifications

1) เพิ่ม Global Responsive Safety Layer ให้ทุกหน้า HTML
- ป้องกันหน้าล้นแนวนอน
- ข้อความ/URL ยาวตัดบรรทัดในกรอบ
- รูป/ฟอร์ม/Modal ไม่เกินหน้าจอ
- Toolbar และ Grid ปรับเป็นคอลัมน์บนมือถือ
- Footer และ Admin UI รองรับจอเล็ก

2) LINE Member Notifications
- Admin อนุมัติ/ไม่อนุมัติสมาชิก -> แจ้ง LINE ของสมาชิกที่เชื่อมบัญชี
- Admin ยืนยัน/ไม่อนุมัติการชำระ -> แจ้ง LINE พร้อมเลขใบเสร็จเมื่ออนุมัติ
- Admin ยืนยัน/ไม่อนุมัติการบริจาค -> แจ้ง LINE สมาชิกที่เชื่อมบัญชี
- การแจ้งเตือนล้มเหลวจะไม่ทำให้ธุรกรรม Admin ล้มเหลว

ใช้ LINE_CHANNEL_ACCESS_TOKEN เดิม ไม่ต้องสร้าง Secret เพิ่ม
