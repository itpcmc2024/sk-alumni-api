SK Alumni System V2.6.94 – Pre-Production Audit + Go-Live Readiness

PURPOSE
This release is a stabilization/audit release based directly on V2.6.93. It intentionally avoids adding a paid external slip-verification service. Payment and donation evidence remains Manual Admin Verification.

WHAT IS LOCKED IN
1. LINE OA Inbox/Data Management behavior from V2.6.93 remains the baseline.
2. Quiet Conversation remains enabled to avoid unnecessary acknowledgement bubbles.
3. Admin manually checks payment/donation slips before approval.
4. Existing automatic accounting/receipt flow after Admin approval is retained.
5. No destructive automatic test-data reset endpoint was added. Production data must never be bulk-cleared from the public/admin UI by accident.
6. Version/cache-busting references are synchronized to V2.6.94.

PRE-PRODUCTION AUDIT COMPLETED ON SOURCE PACKAGE
- Git merge-conflict marker scan: PASS for active HTML/JS/JSON/CSS.
- Worker JavaScript syntax check: PASS.
- Active page version synchronization: V2.6.94.
- Cloudflare Worker version/health response: V2.6.94.
- Existing Admin-protected API design retained.
- LINE polling/performance behavior from V2.6.93 retained (Conversation view only; quiet message refresh).
- Responsive assets from the proven V2.6.85/V2.6.93 baseline retained to reduce regression risk.

MANUAL SLIP VERIFICATION POLICY
Admin must compare the uploaded evidence with the submitted transaction before approval, including:
- payer/member identity when available
- amount
- destination account
- transfer date/time
- duplicate-looking evidence / repeated reference
If uncertain, do not approve until verified manually.

GO-LIVE CHECKLIST
[ ] 1. Back up the current Git repository/branch before replacing files.
[ ] 2. Confirm Cloudflare secrets/bindings remain configured (Hyperdrive and LINE secrets/tokens).
[ ] 3. Deploy Worker and verify /api/health and /api/line/health.
[ ] 4. Push V2.6.94 static files to GitHub Pages and hard refresh browser/mobile.
[ ] 5. Test Admin login/logout on desktop and small screen.
[ ] 6. Test member register -> approval -> member portal/status.
[ ] 7. Test LINE account linking and Admin Inbox: text, emoji, image, file, read state, reply.
[ ] 8. Test LINE Data Management search/sort/pagination/selection/cleanup with test-only records.
[ ] 9. Test payment submission with slip -> Manual Admin approval/rejection -> ledger -> receipt.
[ ] 10. Test donation submission with slip -> Manual Admin approval/rejection -> ledger -> receipt.
[ ] 11. Test receipt print/reprint log and remittance/report flows.
[ ] 12. Test news/activity/media management and public display.
[ ] 13. Test member benefits and benefit-usage accounting.
[ ] 14. Verify all CSV/export functions used by Admin.
[ ] 15. Verify responsive layout on desktop, tablet, and phone.
[ ] 16. Only after all checks pass: remove TEST RECORDS manually by known IDs/records. Do not bulk-delete production history.
[ ] 17. Create a final pre-launch backup/tag.

SAFE TEST-DATA RESET RULE
V2.6.94 does NOT provide a one-click database wipe. This is deliberate. Clear only records positively identified as test data from the appropriate management screen or by a reviewed SQL operation after a backup. Accounting, receipts, remittance, member history, LINE history, and linked-member data may reference one another, so blind TRUNCATE/DELETE operations are not recommended.

WINDOWS DEPLOY (PowerShell / VS Code Terminal)
1. Open the project folder.
2. Confirm branch/status:
   git status
   git branch
3. Create safety branch before replacing/deploying:
   git branch backup-v2.6.94-predeploy
4. After copying V2.6.94 files into the repository:
   git add -A
   git commit -m "SK Alumni System V2.6.94 Pre-Production Audit Go-Live Readiness"
5. If origin/main is ahead, DO NOT resolve conflicts by guessing. Back up first, then inspect history.
6. Push only when local history is correct:
   git push origin main
7. Worker dry run:
   npx wrangler deploy --dry-run
8. Worker deploy:
   npx wrangler deploy

IMPORTANT
Do not run destructive database cleanup just because the UI looks ready. Complete the checklist first and keep a backup before final test-data cleanup.
