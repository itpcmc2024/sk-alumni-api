SK Alumni System V2.6.32 – Admin Typography + Mobile Footer Unified

ปรับจาก V2.6.31 โดยยึดโครงสร้างเดิม ไม่แก้ API/Database/Worker

1) Typography ของ Admin
- หัวข้อหลักของแต่ละโมดูล Admin ใช้สีเขียว #075f43
- ใช้ฟอนต์ Mitr แบบเดียวกับหัวข้อหลักในโมดูลฝั่งผู้ใช้
- หน้าจัดการสมาชิกคงขนาดหัวข้อเดิม 25px
- กำหนดเป็นมาตรฐานร่วมสำหรับ page-title / section-title ของ Admin

2) Footer บนหน้าจอเล็ก
- จัดโลโก้ ชื่อสมาคม คำโปรย และ Copyright ให้อยู่กึ่งกลางทั้งหมด
- ปรับเป็นแนวตั้งเพื่อไม่ให้ข้อความเบียด/ล้นจอ
- ใช้รูปแบบเดียวกันทุกโมดูล Admin

3) Version
- อัปเดตข้อความและ cache-busting จาก V2.6.31 เป็น V2.6.32

การติดตั้ง
- นำไฟล์ในชุดนี้วางทับ repository เดิมทั้งหมด
- Commit/Push ไป branch main
- รอ GitHub Pages deploy สำเร็จ
- Hard Refresh: Windows Ctrl+Shift+R / Mac Cmd+Shift+R
- ไม่ต้องรัน SQL และไม่ต้อง Deploy Cloudflare Worker
