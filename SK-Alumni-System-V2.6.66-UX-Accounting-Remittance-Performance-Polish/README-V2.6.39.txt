SK Alumni System V2.6.39 – Admin Member Display Polish

ปรับจาก V2.6.37 เฉพาะการแสดงผลหน้า Admin > จัดการสมาชิก
- ลบปุ่ม “ศูนย์จัดการระบบ” ที่ถูกสร้างซ้ำด้านบน เหลือปุ่มในบรรทัดเดียวกับหัวข้อจัดการสมาชิก
- ย่อข้อความตัวเลือกสถานะ cancelled เป็น “ยกเลิก/ไม่อนุมัติ” โดยชื่อบนการ์ดสถานะยังคง “สมาชิกยกเลิก/ไม่อนุมัติ”
- ย้ายชุด ก่อนหน้า / หน้า x / y / ถัดไป ไปไว้บนหัวตาราง ก่อนปุ่ม Refresh
- อัปเดตเลขเวอร์ชันทุกหน้า HTML และ cache-bust ของ shared navigation เป็น V2.6.39

หมายเหตุ: เวอร์ชันนี้เป็น UI-only ไม่ได้เปลี่ยน Worker/API logic จาก V2.6.37

V2.6.39: Admin Center footer unified to a single line, matching member admin.
