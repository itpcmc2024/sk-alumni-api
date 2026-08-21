SK Alumni System V2.6.29 – Admin Footer Fix + Member Template Phase 1

Changes
- Harden Admin Center footer against cached/missing CSS; logo size fixed by CSS and HTML attributes.
- Responsive footer now matches public-site style without overflow on small screens.
- Updated admin pages to V2.6.29 footer.
- Started Admin Member module template phase: unified navigation/context while keeping current member/API logic unchanged.

Deploy
- Front-end/Admin HTML + CSS only.
- No PostgreSQL migration.
- No Cloudflare Worker deploy required.
- Commit/push to GitHub main and wait for GitHub Pages.
