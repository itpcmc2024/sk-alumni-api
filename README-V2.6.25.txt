SK Alumni System V2.6.28 – Core Runtime Load Fix

แก้สาเหตุหลักของหน้าโมดูลขึ้นหน้าขาว/ข้อความดิบ:
- assets/site.js เดิมถูกโหลดด้วย defer แต่ inline script ของหลายโมดูลเรียก footer(), api(), e(), fmtDate() ก่อน site.js ทำงาน
- เปลี่ยน site.js ให้โหลดแบบ synchronous ในทุกหน้าโมดูล เพื่อให้ core functions พร้อมก่อน inline script
- bump cache assets เป็น 2.6.27
- เปลี่ยน cache key settings เป็น sk_public_settings_v2625 เพื่อตัด cache เก่า
- ไม่แก้ PostgreSQL และไม่ต้อง deploy Cloudflare Worker สำหรับชุดนี้

หลังอัปโหลด GitHub Pages:
1) รอ Actions pages build and deployment เป็นสีเขียว
2) เปิดด้วย ?v=2.6.28 หรือ hard refresh
3) ทดสอบ payment / donation / benefits / news / admin-home
