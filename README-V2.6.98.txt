SK Alumni System V2.6.98 — LINE Pastel Rich Menu + Flex UX

ต่อยอดจาก V2.6.97 โดยคงระบบ Admin, Member Portal, LINE Sticker,
Fast Send และ Print Date เดิมทั้งหมด

รายการปรับปรุง
1. เพิ่ม Flex Message ต้อนรับโทนเขียวพาสเทล
2. เพิ่ม Flex Message เมนูสมาชิก 6 รายการ
3. เพิ่มเมนูย่อย “ประวัติของฉัน” สำหรับประวัติชำระ/บริจาค/ใช้สิทธิ์
4. เปลี่ยนลิงก์ลงทะเบียน สถานะ สิทธิประโยชน์ เชื่อมบัญชี และ Member Portal เป็นการ์ดกดง่าย
5. เพิ่มภาพ Rich Menu 2500 x 1686 พิกเซล พร้อมพื้นที่กด 6 ช่อง
6. เพิ่มคู่มือตั้งค่า LINE OA Manager: LINE-RICH-MENU-SETUP-V2.6.98.txt

Deploy
  git add .
  git commit -m "SK Alumni System V2.6.98 LINE Pastel Rich Menu Flex UX"
  git push origin main
  npx.cmd wrangler deploy

หลัง Deploy เสร็จ ให้ตั้งค่า Rich Menu ตามคู่มือ แล้วทดสอบทั้ง 6 ช่องใน LINE จริง
