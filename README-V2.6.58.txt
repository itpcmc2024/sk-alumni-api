SK Alumni System V2.6.58 – Core Version + Admin Access Recovery

Main recovery scope:
1. One visible version baseline across public/admin pages: V2.6.58.
2. Fix legacy assets/module-nav.js hard-coded V2.6.51 that could overwrite links/header behavior after page load.
3. Module navigation automatically normalizes stale ?v= query values to 2.6.58 without reloading.
4. Admin member login uses a dedicated auth-check before loading members and sends both Authorization Bearer and X-Admin-Key headers.
5. Admin login error is shown clearly; a valid key is saved compatibly to both legacy/current key names.
6. News admin removes the redundant small “ข่าวสาร” badge above the module title.
7. Media manager now includes images already stored inside News/Announcement/Activity records as read-only source images for easier reuse.

This release intentionally does NOT yet change the receipt numbering/business rules. Receipt-book and cash-remittance design is reserved for the next phase after core access/version stability is verified.
