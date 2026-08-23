SK Alumni System V2.6.62 – Member Access Emergency Fix

Focused hotfix only:
- Admin Member Management: login is validated independently from member-list loading.
- Admin members API: tolerant fallback when optional member/address schema is incomplete.
- Member Portal: tolerant member/address lookup for upgraded databases.
- Member identity matching: supports email and Thai phone normalization (+66/66/0).
- Version bumped to 2.6.62 across packaged runtime pages/API.

Deploy order: Cloudflare Worker first, then GitHub Pages files, then hard refresh.
