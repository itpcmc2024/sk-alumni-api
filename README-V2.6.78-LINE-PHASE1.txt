SK Alumni System V2.6.79.1.1 – LINE Integration Phase 1

เพิ่ม:
- LINE Messaging API Webhook: POST /api/line/webhook
- ตรวจสอบ x-line-signature ด้วย HMAC-SHA256 ก่อนประมวลผลทุก event
- ใช้ Cloudflare secrets: LINE_CHANNEL_ACCESS_TOKEN, LINE_CHANNEL_SECRET
- เก็บ LINE user/event ลง PostgreSQL แบบ self-healing: line_users, line_event_logs
- รองรับ follow / unfollow / text message เบื้องต้น
- คำสั่ง: เมนู, ลงทะเบียน, สมาชิก/ข้อมูลสมาชิก/สิทธิประโยชน์, ติดต่อแอดมิน
- ตอบกลับด้วย Messaging API reply endpoint
- Sync version เป็น V2.6.79.1.1 ทั้ง Worker และหน้าเว็บ

Webhook URL:
https://sk-alumni-api.itpcmc2024.workers.dev/api/line/webhook

หลัง Deploy:
1) ใส่ URL ข้างบนใน LINE Official Account Manager > Messaging API > Webhook URL แล้วบันทึก
2) ไป LINE Developers > Messaging API > Webhook settings แล้วกด Verify
3) เปิด Use webhook
4) แนะนำปิด Auto-reply messages ใน OA Manager เพื่อไม่ให้ข้อความตอบซ้ำกับ Bot API
5) เพิ่ม OA เป็นเพื่อน แล้วพิมพ์ “เมนู” เพื่อทดสอบ

หมายเหตุ:
- Phase 1 ยังไม่ผูก LINE userId กับ member_code แบบยืนยันตัวตนถาวร
- Phase 2 จะทำ LINE account linking / member login / member profile actions
- ห้ามใส่ Channel Secret หรือ Access Token ลงใน source code/GitHub
