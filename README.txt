SK Alumni System V2.0 – Full Web Foundation
===========================================

โครงสร้าง
---------
index.html              หน้าแรก
register.html           ลงทะเบียนศิษย์เก่า
status.html             ตรวจสอบสถานะ
member.html             เข้าสู่ข้อมูลสมาชิก
benefits.html           สิทธิประโยชน์
payment.html            แจ้งชำระค่าสมาชิก
donation.html           แจ้งบริจาค
news.html               ข่าวสาร
admin-home.html          ศูนย์ Admin
admin.html               จัดการสมาชิก
admin-finance.html       รายการชำระ/บริจาค
admin-content.html       เพิ่มข่าวสาร
admin-benefits.html      เพิ่มสิทธิประโยชน์
admin-settings.html      ตั้งค่าระบบ
assets/                  รูป + CSS + JS
src/index.js             Cloudflare Worker API V2.0
sql/migrate-v2.sql       SQL เพิ่มโมดูลฐานข้อมูล
package.json             dependencies
wrangler.jsonc           Cloudflare Worker config

ลำดับติดตั้งที่แนะนำ
--------------------
1) Aiven > PG Studio
   เปิด sql/migrate-v2.sql, Copy ทั้งไฟล์, Run 1 ครั้ง

2) Cloudflare Worker > Settings > Variables and secrets
   ตรวจว่า ADMIN_API_KEY ยังมีอยู่ และ Hyperdrive binding ชื่อ HYPERDRIVE ยังมีอยู่

3) GitHub repo itpcmc2024/sk-alumni-api
   Upload/Replace ไฟล์และโฟลเดอร์ทั้งหมดในชุด V2.0 ลงที่ root ของ repo
   Commit changes

4) Cloudflare จะ Build จาก GitHub
   ตรวจ Deployments ให้เป็นสีเขียว
   API health:
   https://sk-alumni-api.itpcmc2024.workers.dev/api/health

5) GitHub Pages
   Settings > Pages > Deploy from a branch > main > /(root)
   หน้าเว็บ:
   https://itpcmc2024.github.io/sk-alumni-api/

6) ทดสอบตามลำดับ
   หน้าแรก > ลงทะเบียน > Admin อนุมัติ > ตรวจสถานะ > เข้าสมาชิก
   จากนั้นทดสอบ ชำระสมาชิก / บริจาค / ข่าว / สิทธิประโยชน์ / ตั้งค่าระบบ

หมายเหตุ V2.0
-------------
- ระบบนี้ใช้ PostgreSQL + Cloudflare Worker/Hyperdrive + GitHub Pages
- ADMIN_API_KEY ต้องเก็บเป็น Cloudflare Secret ห้ามใส่ใน HTML/GitHub
- V2.0 ยังใช้ URL หลักฐานการโอนเป็นฟิลด์ slip_url ก่อน
  ขั้น R2 Upload หลักฐานจริงสามารถเพิ่มเป็นโมดูลถัดไปโดยไม่รื้อระบบนี้
- Footer ทุกโมดูลระบุชื่อโมดูล + V2.0
