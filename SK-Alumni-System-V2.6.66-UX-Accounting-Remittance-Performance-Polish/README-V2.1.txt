SK Alumni System V2.1 – Public Home Portal
================================================

ไฟล์ในแพ็กเกจนี้
- index.html  หน้า Home Portal ใหม่

วิธีอัปเดตผ่าน VS Code / Git
1) แตก ZIP
2) Copy index.html
3) ไปที่ Documents/sk-alumni-api
4) Paste และเลือก Replace
5) กลับ VS Code > Source Control
6) ตรวจว่า index.html แสดง M
7) Commit message:
   SK Alumni System V2.1 Public Home Portal
8) กด Commit
9) กด Sync Changes / Push

หมายเหตุ
- ไม่ต้องรัน SQL เพิ่มสำหรับ V2.1 นี้
- ไม่ต้องแก้ src/index.js
- ไม่ต้องแก้ Cloudflare bindings
- หน้า Home ใช้ assets เดิม:
  assets/association-logo.jpg
  assets/mosque-reference.jpg
- ลิงก์การ์ดเชื่อมไปยังโมดูล V2.0 เดิมด้วย relative URLs
- footer ระบุ Public Home V2.1
