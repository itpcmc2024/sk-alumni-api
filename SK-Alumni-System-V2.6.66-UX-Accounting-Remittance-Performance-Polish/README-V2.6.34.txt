SK Alumni System V2.6.34 – Member Management Complete Phase 2

Admin - Manage Member improvements:
- Desktop footer aligned: copyright is a single line on the left, association block aligned to the table/right edge.
- Member table column "ติดต่อ" combines phone + lighter email.
- Status colors: payment pending yellow, review blue, active green, rejected red.
- Rejected status requires reason and stores it in the same status field: ไม่อนุมัติ (เหตุผล).
- View member modal mirrors member portal tabs: personal / payments / donations / benefits plus admin audit log.
- View modal has Close only (no print button).
- Clean edit modal with prominent photo + member code; supports replacing/removing member photo.
- Admin edits/status/deletion write member_admin_logs for audit trail.
- Hard delete deletes member-related payments/donations/benefit usage/address/history/photo/member row, with confirmation twice.
- Print chooser renamed to Digital Member Card / Membership Certificate, using member-module styling.
- Added filtered CSV export after Search.
- Pager centered and clearer.
- Worker version 2.6.34 and new member overview/log API.

Deployment:
1) Replace repository files with this version and commit/push to main (GitHub Pages).
2) Run npm install only if node_modules is missing.
3) Run npx wrangler deploy to deploy src/index.js Worker changes.
4) Hard refresh Admin page (Ctrl+F5).
