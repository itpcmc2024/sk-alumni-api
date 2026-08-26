-- SK Alumni System V2.6.97 - Allow Admin Key reuse with User ID authentication
ALTER TABLE admin_accounts
  DROP CONSTRAINT IF EXISTS admin_accounts_key_hash_key;

DROP INDEX IF EXISTS admin_accounts_key_hash_key;

CREATE INDEX IF NOT EXISTS idx_admin_accounts_key_hash
  ON admin_accounts(key_hash);
