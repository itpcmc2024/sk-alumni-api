SK Alumni System V2.6.65 – Portal + Receipt + Accounting + Remittance Fix

แก้ไขหลัก:
- Member portal: แก้โค้ด JavaScript หลุดออกมาเป็นข้อความ และรองรับ status token เข้าโปรไฟล์โดยตรง
- Status: ใช้ endpoint ที่คืน access token จริง
- Benefits: เอาป้ายสิทธิประโยชน์ซ้ำออก
- Admin Members: navigator กระชับและ responsive
- Receipt: แก้ original is not defined และการเปิด/พิมพ์ใบเสร็จ
- Benefit Accounting: sync/backfill การใช้สิทธิ์เป็นรายจ่ายอัตโนมัติ รวมรายการย้อนหลัง
- Remittance: ดู/พิมพ์แบบสรุปนำส่งเงิน พร้อมสรุปหมวดและ Log สร้าง/พิมพ์/ยกเลิก
- Media library: เพิ่มตัวกรองรูปสมาชิก/หลักฐานค่าสมาชิก/หลักฐานบริจาค/หลักฐานใช้สิทธิ์
- Benefits Admin: ปุ่มบันทึก/ยกเลิกแก้ไขอยู่บรรทัดเดียวกัน
- Payment topics: หน้าผู้ใช้แสดงชื่อหัวข้อจากการตั้งค่า Admin จริง ไม่ถูก hard-code ทับ
- ปรับเวอร์ชันทุกจุดเป็น V2.6.65
