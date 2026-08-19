SK Alumni System V2.6.21 – Module DOM Recovery

แก้ไขหน้าที่ล้มเหลวจาก JavaScript อ้างอิง DOM แบบ implicit/global และ element ที่อาจยังไม่พร้อม:
- payment.html
- benefits.html
- donation.html
- news.html
- admin-home.html
- เพิ่ม null guards ใน shared settings/module navigation
- เปลี่ยนการเริ่มทำงานเป็น DOMContentLoaded แบบปลอดภัย
- payment ใช้ Promise.allSettled เพื่อให้หน้าเปิดได้แม้ endpoint ใด endpoint หนึ่งมีปัญหา

Deployment:
1) แทนที่ไฟล์ทั้งหมดใน repository ด้วยชุดนี้ (คง .git ของคุณไว้)
2) Commit: SK Alumni System V2.6.21 – Module DOM Recovery
3) Push main
4) รอ GitHub Pages Actions เป็นสีเขียว
5) Cloudflare Worker: ถ้า src/index.js ไม่ได้เปลี่ยนจาก production ปัจจุบัน ไม่จำเป็นต้อง deploy Worker ซ้ำ
