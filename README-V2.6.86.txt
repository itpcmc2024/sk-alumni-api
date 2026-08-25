SK Alumni System V2.6.86 – LINE Inbox Reliability + Conversation UX

FIXES
1) LINE Inbox persistence
- Root cause fixed: the PostgreSQL client was being closed in fetch.finally() while ctx.waitUntil() jobs were still saving LINE events/inbox messages.
- Webhook now keeps the shared DB client alive until every LINE background job settles, then closes it.
- LINE replies remain fast while Admin Inbox persistence completes reliably.

2) Admin → LINE สมาชิก UI
- Redesigned to match the Admin Receipt/Finance visual language.
- 1440px centered admin workspace, consistent page header/actions, 44px toolbar controls and navigator.
- Added counters for total inbox items, unread items, linked LINE users and stored LINE events.
- Conversation cards show member identity, direction, time, unread state and direct reply box.
- Responsive desktop/tablet/mobile layout.

3) LINE diagnostics (next phase foundation)
- Added GET /api/admin/line/diagnostics for operational counters.
- Inbox remains recoverable from line_event_logs for free-form member messages.

VERSION
- API/UI/address query version synchronized to V2.6.86.

TEST
1. Deploy Worker.
2. In LINE send: แอดมิน ทดสอบข้อความ V2.6.86
3. Send another free-form message without the แอดมิน prefix.
4. Open Admin → LINE สมาชิก and press รีเฟรช.
5. Both messages should appear. Reply from Admin and confirm the LINE user receives it.
