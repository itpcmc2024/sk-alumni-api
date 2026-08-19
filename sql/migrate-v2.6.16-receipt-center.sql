-- SK Alumni System V2.6.16 - additive compatibility migration
-- Safe: no DROP / DELETE. Run once in PostgreSQL if desired; Worker also self-heals these structures.
ALTER TABLE IF EXISTS public.payment_topics ADD COLUMN IF NOT EXISTS description TEXT;
ALTER TABLE IF EXISTS public.payment_topics ADD COLUMN IF NOT EXISTS amount NUMERIC(12,2);
ALTER TABLE IF EXISTS public.payment_topics ADD COLUMN IF NOT EXISTS active BOOLEAN NOT NULL DEFAULT TRUE;
ALTER TABLE IF EXISTS public.payment_topics ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE IF EXISTS public.payment_topics ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE IF EXISTS public.payments ADD COLUMN IF NOT EXISTS receipt_no TEXT;
ALTER TABLE IF EXISTS public.payments ADD COLUMN IF NOT EXISTS receipt_issued_at TIMESTAMPTZ;
CREATE TABLE IF NOT EXISTS public.receipt_print_logs (
  log_id TEXT PRIMARY KEY, batch_id TEXT, payment_id TEXT, receipt_no TEXT,
  print_type TEXT NOT NULL DEFAULT 'single', printed_by TEXT,
  printed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), user_agent TEXT
);
CREATE INDEX IF NOT EXISTS idx_receipt_print_logs_payment ON public.receipt_print_logs(payment_id,printed_at DESC);
