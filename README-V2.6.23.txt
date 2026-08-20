SK Alumni System V2.6.23 – Known Good Module Restore

Purpose
- Recover module pages that were rendering as a blank/raw-text page in V2.6.21–V2.6.22.
- Restore the public/admin module page layer from the last known-good V2.6.18 baseline.
- Keep the newer V2.6.22 backend (src/index.js), database configuration, receipt pages, assets and current data flow.
- Add cache-busting version parameters so GitHub Pages/Chrome do not reuse broken HTML/JS from older recovery builds.

Restored module pages
- payment.html
- benefits.html
- donation.html
- news.html
- admin-home.html
- admin.html
- admin-benefits.html
- admin-content.html
- admin-finance.html
- admin-receipts.html
- admin-settings.html

Deployment
1. Extract ZIP.
2. Copy ALL contents inside this folder over the ROOT of repository sk-alumni-api (same level as index.html/package.json).
3. Do not upload the outer folder as a nested folder.
4. Commit: SK Alumni System V2.6.23 – Known Good Module Restore
5. Push/Sync to main and wait for GitHub Pages workflow to turn green.
6. Test the home cards again. Links include ?v=2.6.23 to bypass old browser/GitHub cache.

Cloudflare Worker / PostgreSQL
- No SQL migration required.
- No Cloudflare Worker deploy required for this recovery build because src/index.js/backend is unchanged from V2.6.22.
