-- SK Alumni System V2.6.95 - Multi Admin Accounts
CREATE TABLE IF NOT EXISTS admin_accounts (
  admin_id TEXT PRIMARY KEY,
  full_name TEXT NOT NULL,
  key_hash TEXT NOT NULL UNIQUE,
  role TEXT NOT NULL DEFAULT 'admin',
  active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_login_at TIMESTAMPTZ
);
