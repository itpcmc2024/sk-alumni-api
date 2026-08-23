SK Alumni System V2.6.28 – Admin Template Foundation

Admin template foundation only; business logic remains based on V2.6.27.

Changes:
- Admin Center responsive “🏠 กลับหน้าบ้าน” action on small screens.
- Unified Admin footer to visually match the public website footer.
- Admin Member header gains Back to Frontend + Admin Center actions.
- Admin module headers keep Admin Center navigation and include Frontend shortcut.
- Report Summary is structurally moved into the Transactions module as a tab, calculated from already-loaded transaction data (no new API dependency).
- Existing drag-and-drop card ordering is preserved.

Next module UI mapping confirmed from supplied reference screens:
1) Member Management
2) System Settings
3) Website Management: home text / news / file library / transaction topics
4) Benefits Management
5) Transaction module: includes Summary Report

No PostgreSQL migration. No Cloudflare Worker deploy required for this template-only phase.
