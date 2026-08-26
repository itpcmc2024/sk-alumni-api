SK Alumni System V2.6.97 – Shared Admin Key + Login Identity + Print Date Restore

ต่อยอดจาก V2.6.96 – LINE Sticker + Fast Send + Print Footer Polish

รายการปรับปรุง
1. บัญชีผู้ดูแลระบบ
   - อนุญาตให้ Admin หลายบัญชีใช้ Admin Key ซ้ำกันได้
   - ใช้ User ID + Admin Key เป็นคู่ข้อมูลเข้าสู่ระบบ เพื่อแยกชื่อและสิทธิ์ของแต่ละบัญชี
   - หน้า Login เดิมเพิ่มช่อง User ID
   - ROOT Login ที่หน้าเดียวกันด้วย User ID: ROOT และ Admin Key เดิมของระบบ
   - Admin ที่เพิ่มใหม่ Login หน้าเดียวกับ ROOT ได้ทันทีหลังบันทึกและ Deploy

2. แก้ไข Admin
   - แก้ชื่อ-นามสกุลเดิมได้โดยเว้นช่อง Admin Key ว่าง
   - แยกคำสั่ง UPDATE กรณีเปลี่ยน Key และไม่เปลี่ยน Key ป้องกัน PostgreSQL parameter error
   - ข้อความ Error ระบุ User ID ซ้ำโดยตรง ไม่รวม Admin Key ซ้ำเป็นข้อผิดพลาด

3. แบบพิมพ์
   - ใบเสร็จเดี่ยว ใบเสร็จหลายใบ และใบนำส่งเงิน แสดงสองบรรทัดที่มุมซ้ายล่าง
   - บรรทัดแรก: ผู้พิมพ์: ชื่อ (User ID) · พิมพ์ครั้งที่ ... / ยังไม่ได้พิมพ์
   - บรรทัดที่สอง: วันที่พิมพ์ : วัน... เวลา ... น.
   - ลดขนาดบรรทัดวันที่เพื่อรองรับข้อความยาวโดยไม่ชน Copyright

4. ฐานข้อมูล
   - เพิ่ม sql/migrate-v2.6.97-admin-key-sharing.sql เพื่อนำ UNIQUE ออกจาก key_hash
   - Worker มี self-healing schema และจะปรับ constraint ให้อัตโนมัติเมื่อใช้งานครั้งแรกหลัง Deploy

ขั้นตอนติดตั้ง Windows
1. วางไฟล์ทั้งหมดทับโปรเจกต์เดิม
2. อัปโหลดและ Deploy (ไม่ต้องรันคำสั่งฐานข้อมูลแยก):
   git add -A
   git commit -m "SK Alumni System V2.6.97 Shared Admin Key Login Identity Print Date"
   git push origin main
   npx.cmd wrangler deploy

ทดสอบหลัง Deploy
1. Login ROOT ด้วย User ID ROOT + Key เดิม
2. เพิ่ม Admin สองบัญชีด้วย Key เดียวกัน
3. Logout แล้ว Login แต่ละบัญชีด้วย User ID ของบัญชีนั้น + Key ที่ใช้ร่วมกัน
4. แก้เฉพาะชื่อ Admin โดยเว้น Key ว่าง
5. พิมพ์ใบเสร็จเดี่ยว ใบเสร็จหลายใบ และใบนำส่งเงิน ตรวจสองบรรทัดท้ายเอกสาร
