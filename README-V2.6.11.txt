SK Alumni System V2.6.11 – Benefits Login Fix + Payment Workflow Phase 1

แก้ไข:
- แก้ selectByText is not defined ใน Member Portal
- ทำกรอบหัวโมดูลให้เป็นรูปแบบเดียวกับหน้า ตรวจสอบสถานะ
- หน้าแจ้งชำระสมาชิก: ดึงข้อมูลสมาชิกอัตโนมัติ, หัวข้อจาก Admin, ยอดจาก Admin, QR PromptPay กำหนดยอด, บังคับแนบสลิปและติ๊กยืนยัน
- Admin Settings เพิ่มจัดการหัวข้อการชำระ
- Admin Finance เพิ่มยืนยัน/ไม่อนุมัติการชำระ
- เมื่อ Admin ยืนยัน: payments -> ชำระแล้ว, ต่ออายุสมาชิก 1 ปี, สถานะ active, บันทึก ledger_entries เป็นรายรับ
- ประวัติชำระสมาชิกใน Member Portal ใช้ข้อมูล payments ที่ยืนยันแล้ว/อยู่ในระบบ
- Slip verification อัตโนมัติยังไม่รวมในเฟสนี้

Version: 2.6.11
