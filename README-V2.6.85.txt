SK Alumni System V2.6.87 – LINE Inbox + Mobile Table Polish

1) LINE Admin Inbox reliability
- LINE webhook uses Cloudflare ctx.waitUntil() for database persistence after replying.
- Contact-admin mode: after the user sends "ติดต่อแอดมิน", the next normal text is treated as an Admin message for 10 minutes.
- Prefix commands "แอดมิน ..." and "admin ..." remain supported.
- Admin LINE inbox includes recovery from line_event_logs.

2) Admin settings mobile UX
- Payment/support topic text remains readable.
- Status/Edit/Close/Delete actions stay in one horizontally scrollable row.

3) Receipt Center mobile tables
- Tables are not squeezed into the phone width.
- Headers and cells do not break character-by-character.
- Horizontal scrolling is enabled for all receipt-center table panels.

4) Version sync
- Web/API/address links updated to V2.6.87.
