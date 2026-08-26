SK Alumni System V2.6.95.1 – Admin Account Management Polish

- LINE emoji panel closes after selection / focus / outside click / Esc / send / image / file.
- Receipt, batch receipt, and remittance footer: printer + print count at bottom-left; system copyright/version at bottom-right in small light text.
- Admin Center mobile: Logout button after Home.
- Multi Admin: edit User ID, full name, role, optional new Admin Key, enable/disable.
- Prevent disabling or demoting the last active Owner.
- No additional SQL migration required beyond V2.6.95 admin_accounts.

Windows deploy:
git add -A
git commit -m "SK Alumni System V2.6.95.1 Admin Account Management Polish"
git push origin main
npx.cmd wrangler deploy
