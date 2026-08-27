SK Alumni System V2.7.09 – Header LINE Add Friend

สิ่งที่เพิ่มในรุ่นนี้
- เพิ่มปุ่มทางการ “เพิ่มเพื่อน LINE” ถัดจากเมนู Admin ในเมนูบนของทุกหน้า
- ปุ่มเปิด https://lin.ee/ph4ZuFG ในแท็บใหม่ จึงไม่ทำให้ผู้ใช้ออกจากระบบ
- มือถือ: ปุ่มอยู่ถัดจาก Admin ในแถบเมนูมือถือ และมีขนาด 32 px เพื่อไม่ให้เมนูล้น
- คงการทำงานเดิมทั้งหมด รวมถึง LINE webhook และการตั้งค่าโทรแอดมิน

การติดตั้ง
1. แตก ZIP ทับโฟลเดอร์โปรเจกต์เดิม
2. git add -A
3. git commit -m "SK Alumni System V2.7.09 Header LINE Add Friend"
4. git push origin main

ไม่ต้อง deploy Worker เพราะไม่มีการเปลี่ยนแปลง src/index.js
