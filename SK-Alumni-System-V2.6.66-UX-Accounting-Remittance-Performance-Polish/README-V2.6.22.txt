SK Alumni System V2.6.22 – Standalone Module Recovery

แก้ไขจาก V2.6.21 โดยตรง
- benefits.html / payment.html / donation.html / news.html / admin-home.html ไม่พึ่ง module-nav.js ในการสร้าง/แทน header อีกต่อไป
- แต่ละหน้ามี header และ main ของตัวเองอยู่ใน HTML จึงไม่เกิดหน้าขาวจาก shared navigation script
- เพิ่ม critical CSS inline บังคับให้ body/main แสดงผล แม้ shared CSS/JS โหลดผิดพลาด
- bump cache เป็น V2.6.22 เพื่อป้องกัน Chrome/GitHub Pages ใช้ไฟล์ V2.6.21 ค้าง
- คง API, Cloudflare Worker, PostgreSQL และข้อมูลเดิมทั้งหมด

ติดตั้ง: วางไฟล์ทั้งหมดทับ repository เดิม -> Commit -> Push -> รอ GitHub Pages สำเร็จ -> Hard Refresh
