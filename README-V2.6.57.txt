SK Alumni System V2.6.57 – News + Receipt + Donation UX Fix

Changes
1. Homepage news cards now show category, date, title, excerpt and "อ่านต่อ" when content is longer.
2. Homepage activity/news popup gallery now has previous/next image navigation and image counter, matching News Center behavior.
3. Version labels and frontend cache-busters are unified to V2.6.57 across active pages; Worker health/public settings also report V2.6.57.
4. Admin API key compatibility improved: both sk_alumni_admin_key and SK_ALUMNI_ADMIN_KEY are supported; Admin login syncs both keys.
5. Receipt Center table typography/column widths adjusted to reduce wrapping; date, receipt number, amount and action columns stay on one line with horizontal scroll when needed.
6. Receipt form label changed from "ชื่อ-สกุล" to "ได้รับเงินจาก".
7. Public donation (guest mode) adds optional "เพิ่มที่อยู่สำหรับออกใบเสร็จ" Smart Address. If not selected, receipt address remains "-".
8. Donation database schema is self-healing with optional donor address columns; approved donation receipts use member address first, otherwise guest donation address.

Deployment
- Replace repository files with this version and push to GitHub Pages.
- Worker changed: deploy with `npx wrangler deploy`.
- Hard refresh after Pages deploy: Cmd+Shift+R (macOS) / Ctrl+Shift+R (Windows).
- Recommended test URLs: index.html?v=2.6.57, news.html?v=2.6.57, donation.html?v=2.6.57, admin.html?v=2.6.57, admin-receipts.html?v=2.6.57.
