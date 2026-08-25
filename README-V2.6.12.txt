SK Alumni System V2.6.12 – Member QR Card + Annual Support Polish

ปรับจาก V2.6.11 ตามผลทดสอบ:
- ปุ่มหน้า Status เปลี่ยนเป็น “เข้าสู่ระบบสิทธิประโยชน์” และจัดกึ่งกลาง
- บัตรสมาชิกดิจิทัลเพิ่ม QR Code แบบมี token ตรวจสอบก่อนเปิดข้อมูล
- เพิ่มหน้า member-card.html สำหรับแสดงรายละเอียดจาก QR: เบอร์โทร อีเมล ที่อยู่ อายุสมาชิก
- เปลี่ยนคำเรียกการชำระเป็น “ค่าบำรุงสมาคมศิษย์เก่าฯ รายปี” / “สนับสนุนสมาคมฯ รายปี”
- หน้า Payment เอาคำว่า “ยอดชำระ” ออก และแสดงชื่อบัญชีจาก Admin Setting
- Admin Settings เพิ่ม BANK_ACCOUNT_NAME (ชื่อบัญชีรับชำระ)
- API/public settings รองรับ BANK_ACCOUNT_NAME และ QR signed token
- Sync version เป็น V2.6.12

หมายเหตุ: หลังอัปเดต Worker ให้เปิด Admin Settings กรอก “ชื่อบัญชีรับชำระ” แล้วบันทึก 1 ครั้ง
