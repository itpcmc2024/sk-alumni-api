SK Alumni System V2.6.33 – Member Management Complete Phase 1

Admin Member module updates:
- Desktop footer kept in the same public-home style: logo + association identity on the left, copyright/version on the right.
- Member table columns: member code, full name, email, province, registration date, status, management.
- Management actions: View / Edit / Delete / Print / Member status / Save status.
- Print chooser: Member Card or Member Confirmation Certificate.
- Member status workflow:
  1) payment_pending = รอชำระค่าสนับสนุน (automatic immediately after registration)
  2) review = รอตรวจสอบข้อมูล (automatic after member submits payment)
  3) active = สมาชิกสมบูรณ์ (automatic when Admin approves payment; also selectable by Admin)
- Safe delete: members with transaction/benefit references are protected from deletion.
- Worker API health version updated to 2.6.33.

Deployment:
1. Replace repository files with this package.
2. Commit + push to main.
3. Run: npx wrangler deploy
4. Wait for GitHub Pages deployment, then hard refresh.
