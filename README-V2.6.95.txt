SK Alumni System V2.6.95 – Admin Accountability + Print Audit + LINE UX Polish

Highlights
- Multi-Admin accounts: User ID + full name + individual Admin Key; Owner manages accounts.
- Admin identity returned by /api/admin/me and shown in audit/LINE/print flows.
- Receipt, batch receipt and remittance documents show system/version at top-right and printer identity at document footer.
- LINE Conversation: smoother composer, 12-second background refresh only when idle, emoji stays open during selection, outgoing messages show responding Admin.
- Media library removes misleading zoom cursor; View button remains the explicit preview action.
- Footer visual standard unified across public/admin classes.
- Adds sql/migrate-v2.6.95-admin-accounts.sql (API can also create table lazily).

Recommended UAT
1) Login using legacy ROOT key and create ADM001 in Settings > ผู้ดูแลระบบ.
2) Logout and login using ADM001 key.
3) Reply to LINE and verify the message shows ADM001 name.
4) Print receipt/remittance and verify ผู้พิมพ์: ชื่อ-นามสกุล (ADM001).
5) Test image View, mobile footer, emoji/image/file composer.
