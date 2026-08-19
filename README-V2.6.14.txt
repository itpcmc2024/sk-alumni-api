SK Alumni System V2.6.16 – Admin Transaction Approval Fix + Annual Support Card Polish

ปรับปรุงจาก V2.6.13
1. แก้ปัญหา Admin อนุมัติค่าบำรุงสมาคมฯ แล้วขึ้น Internal server error
   - ปรับการบันทึก ledger ให้ทำงานกับฐานเดิมได้โดยไม่ต้องมี Unique Constraint เพิ่ม
   - ป้องกันการลงบัญชีรายรับซ้ำด้วย WHERE NOT EXISTS
   - การอนุมัติยังคงทำงานแบบ Transaction: ยืนยันรายการ + ต่ออายุสมาชิก 1 ปี + ลงรายรับ
2. ปรับความเสถียรของการอนุมัติเงินบริจาคด้วย Logic ป้องกัน ledger ซ้ำแบบเดียวกัน
3. เปลี่ยนชื่อการ์ดหน้าแรกจาก “สนับสนุนสมาคมฯ รายปี” เป็น “สนับสนุนรายปี”
4. Sync เวอร์ชันหน้า Public / Member / Admin / API เป็น V2.6.16

หมายเหตุ
- ใช้ฐานข้อมูลเดิมได้ ไม่ต้องรัน Migration เพิ่มสำหรับ Fix นี้
- หลัง Deploy Worker และ GitHub Pages ให้ทดสอบรายการสถานะรอตรวจสอบ 1 รายการ โดยกดอนุมัติ แล้วตรวจสอบ: payments.status, members.member_expire และ ledger_entries
