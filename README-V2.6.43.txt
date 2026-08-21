SK Alumni System V2.6.46 – Transaction Accounting UX Phase 2

- Unified Admin Center + Logout actions on every Admin module, including mobile.
- Unified Admin typography (Mitr headings / Noto Sans Thai body & controls).
- Transaction Control Center: per-tab CSV export.
- New real-book-style income/expense ledger with continuous balance and manual entries.
- Automatic payment/donation ledger entries remain locked from manual deletion.
- New accounting summary with date range, income, expense, net, transaction status and category breakdown.
- API adds safe additive accounting schema, manual ledger POST and manual-only DELETE.
- All HTML/cache version markers updated to V2.6.46.

Deployment: GitHub Pages + Cloudflare Worker (src/index.js changed).


V2.6.46 Transaction Accounting Layout + Audit Polish
- Ledger optional evidence attachment (image/PDF)
- Manual ledger view/edit/remove evidence + audit logs
- Ledger sorting/paging and stable running balance
- Date-time displays include seconds and น.
- Admin button press feedback unified
