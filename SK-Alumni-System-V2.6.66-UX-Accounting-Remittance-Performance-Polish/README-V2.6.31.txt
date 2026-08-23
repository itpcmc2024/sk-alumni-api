SK Alumni System V2.6.32 – Admin Header + Footer Unified

ปรับจาก V2.6.30:
- Footer ของทุกโมดูล Admin ใช้รูปแบบเดียวกับหน้า Admin Center
- แก้ Footer หน้าจอเล็กไม่ให้ล้น/แตก/โลโก้หรือข้อความหลุดกรอบ
- หน้าจอใหญ่ Header ของโมดูล Admin จัดชื่อระบบชิดซ้าย และกลุ่มเมนูชิดขวา
- เหลือปุ่ม “🧩 ศูนย์จัดการระบบ” เพียงตำแหน่งเดียวในส่วนหัวเนื้อหา และจัดชิดขวา
- หน้าจอเล็กยังคงปุ่ม หน้าแรก + ศูนย์จัดการระบบ ใน Header แบบเดิม
- เปลี่ยน cache-busting เป็น v=2.6.32

การใช้งาน:
1) วางไฟล์ทั้งหมดทับ repository เดิม
2) Commit/Push main
3) รอ GitHub Pages deploy สำเร็จ
4) Hard Refresh (Ctrl+Shift+R / Cmd+Shift+R)

ไม่ต้องรัน SQL และไม่ต้อง Deploy Cloudflare Worker สำหรับเวอร์ชันนี้
