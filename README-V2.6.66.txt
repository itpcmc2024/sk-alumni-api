SK Alumni System V2.6.66 – UX + Accounting + Remittance + Performance Polish

Changes
- Status page "เข้าสู่ข้อมูลสมาชิก" now routes through benefits.html and accepts status_token for seamless verified-member entry.
- Benefits page can consume status verification token and show member welcome without an extra login.
- Ledger summary colors: income green, expense red, balance/net blue.
- Summary page adds explicit "รายรับจากสมุดบัญชี" and "รายจ่ายจากสมุดบัญชี" cards.
- Remittance action buttons use distinct colors for View / Print / Cancel.
- Remittance print form swaps association/title lines, emphasizes grand total, uses Thai weekday full date/time, and improves sender signature/footer layout.
- Remittance log action labels normalized for create/cancel/print.
- Refresh / CSV / navigator controls standardized across Admin modules.
- Duplicate remittance event bindings removed.
- Static pages preconnect to Worker API to reduce first-request latency.
- Version bumped to V2.6.66.

Deployment
1) Replace GitHub Pages files with this package.
2) Commit + Push.
3) If src/index.js changed compared with your deployed Worker, run: npx wrangler deploy
4) Test with ?v=2.6.66 and Hard Reload once.
