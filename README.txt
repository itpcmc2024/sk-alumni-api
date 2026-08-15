SK Alumni System V1.8 – Admin Sort + Global Footer + Status Module

ปรับจาก V1.7:
- Admin ใช้ฟอนต์แบบระบบเดิม/อ่านง่าย (system font)
- เพิ่มเรียงวันที่สมัคร: ใหม่ → เก่า / เก่า → ใหม่
- จำนวนแถว: 5 / 10 / 20 / 50 / All
- เพิ่ม Footer หน้า Admin
- Register มี Footer อยู่แล้วและคงไว้
- เพิ่มโมดูลใหม่ status.html สำหรับตรวจสอบสถานะสมาชิก
- Footer มีใน register.html, admin.html และ status.html
- ไม่แก้ PostgreSQL schema และไม่แก้ Worker API

ไฟล์ที่ต้องอัปโหลดใหม่:
1. admin.html
2. status.html

register.html และ assets ใช้ต่อจากชุดเดิมได้
