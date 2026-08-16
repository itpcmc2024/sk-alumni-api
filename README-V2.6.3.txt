SK Alumni System V2.6.3 – Registration Logic + Member Flow Fix
====================================================================

ไฟล์ที่ต้องแทนที่
1) src/index.js        -> Backend Worker
2) register.html       -> ลงทะเบียน
3) status.html         -> ตรวจสอบสถานะ
4) member.html         -> Member Portal

สิ่งที่แก้
- Duplicate = ชื่อ + นามสกุล + อีเมล ตรงกันทั้ง 3 ค่า
- Member Code = YY-SK0001, YY-SK0002... และเริ่มใหม่เมื่อเปลี่ยนปี
- แก้บันทึก first_name / last_name / full_name
- บันทึก line_id และ line_user_id ให้ตรงกัน
- บันทึก consent = TRUE และ consent_at
- หลังลงทะเบียนสำเร็จ กด OK แล้วกลับ index.html
- status.html:
  * ไม่พบข้อมูล -> แสดงปุ่มกลับไปหน้าลงทะเบียน
  * รออนุมัติ -> ไม่แสดงปุ่มกลับลงทะเบียน
  * active/ใช้งาน -> แสดงปุ่มเข้าสู่ Member Portal
- member.html ใช้ POST /api/member/login โดยตรง และป้องกัน null element error
- API version = 2.6.3

วิธีติดตั้ง
A. GitHub/VS Code
- Copy 4 ไฟล์ข้างต้นไปทับไฟล์เดิม
- Commit message: SK Alumni System V2.6.3 Registration Logic Member Flow Fix
- Sync / Push

B. Cloudflare Worker
- หลัง Sync เสร็จ รอ Auto Deploy
  หรือที่ Terminal รัน: npx wrangler deploy
- ทดสอบ:
  https://sk-alumni-api.itpcmc2024.workers.dev/api/health
  ต้องเห็น version 2.6.3

C. ทดสอบตามลำดับ
1. สมัครข้อมูลใหม่ -> รหัสต้องเป็น 69-SK0005 (ถ้า 0001-0004 มีอยู่)
2. กด OK -> กลับหน้าหลัก
3. ตรวจสถานะ pending -> ไม่มีปุ่มกลับลงทะเบียน
4. Admin เปลี่ยนเป็น active
5. ตรวจสถานะอีกครั้ง -> มีปุ่มเข้าสู่ Member Portal
6. Member Portal -> กรอกรหัส + Email หรือโทรศัพท์ ต้องเข้าดูได้

หมายเหตุเรื่องข้อมูล 69-SK690005
- ไฟล์ sql/V2.6.3-data-check-and-fix.sql มีคำสั่งตรวจสอบและตัวอย่างแก้
- อย่า Run UPDATE จนกว่าจะยืนยันว่า 69-SK0005 ยังว่าง
