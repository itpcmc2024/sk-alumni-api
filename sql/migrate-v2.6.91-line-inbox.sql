-- SK Alumni V2.6.91 LINE Inbox Reliability
ALTER TABLE IF EXISTS line_event_logs ADD COLUMN IF NOT EXISTS webhook_event_id TEXT;
ALTER TABLE IF EXISTS line_event_logs ADD COLUMN IF NOT EXISTS line_message_id TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS uq_line_event_logs_webhook ON line_event_logs(webhook_event_id) WHERE webhook_event_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS uq_line_event_logs_message ON line_event_logs(line_message_id,event_type) WHERE line_message_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS uq_line_admin_messages_line_message ON line_admin_messages(line_message_id,direction) WHERE line_message_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_line_admin_messages_type_created ON line_admin_messages(message_type,created_at DESC);
