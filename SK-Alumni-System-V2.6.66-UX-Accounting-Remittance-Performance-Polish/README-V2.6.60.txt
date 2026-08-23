SK Alumni System V2.6.60 – Full Package

Core fixes
- Worker/API and all runtime pages/assets unified to V2.6.60.
- Admin Member access recovery: validates Admin key separately and self-heals optional member schema before loading the member list.
- Admin Benefit page no longer renders duplicate System Center / Logout controls. Desktop actions remain in the module heading row; duplicate module actions are hidden on small screens while the standard mobile Admin shell remains available.
- Public Benefits redesigned as two columns: member sign-in on the left and currently active benefits on the right.
- After successful Benefits sign-in, the login form is replaced by a welcome panel and “ดูข้อมูลของฉัน”.
- Benefits login forwards the verified identity to Member Portal and Member Portal can auto-open from that verified handoff.

Data safety
- Database changes are additive only (ALTER ... ADD COLUMN IF NOT EXISTS). No member, payment, donation, receipt, ledger, news, media, or benefit data is deleted by this package.
