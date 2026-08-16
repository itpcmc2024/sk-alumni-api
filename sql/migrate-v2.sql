-- SK Alumni System V2.0 - additive migration
-- Safe intent: creates missing modules and adds required columns without deleting data.

ALTER TABLE IF EXISTS public.addresses ADD COLUMN IF NOT EXISTS address_line TEXT;
ALTER TABLE IF EXISTS public.members ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE IF EXISTS public.members ADD COLUMN IF NOT EXISTS consent_at TIMESTAMPTZ;
ALTER TABLE IF EXISTS public.members ADD COLUMN IF NOT EXISTS member_start TIMESTAMPTZ;
ALTER TABLE IF EXISTS public.members ADD COLUMN IF NOT EXISTS member_expire TIMESTAMPTZ;
ALTER TABLE IF EXISTS public.members ADD COLUMN IF NOT EXISTS line_user_id VARCHAR(100);

CREATE TABLE IF NOT EXISTS public.payment_topics (
  topic_id VARCHAR(50) PRIMARY KEY,
  title VARCHAR(200) NOT NULL,
  description TEXT,
  amount NUMERIC(12,2),
  active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS public.donation_topics (
  topic_id VARCHAR(50) PRIMARY KEY,
  title VARCHAR(200) NOT NULL,
  description TEXT,
  active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS public.bank_accounts (
  account_id VARCHAR(50) PRIMARY KEY,
  bank_name VARCHAR(200), account_name VARCHAR(250), account_no VARCHAR(50),
  promptpay VARCHAR(50), purpose VARCHAR(200), active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS public.payments (
  payment_id VARCHAR(80) PRIMARY KEY,
  member_code VARCHAR(20) NOT NULL REFERENCES public.members(member_code) ON DELETE RESTRICT,
  topic_id VARCHAR(50) REFERENCES public.payment_topics(topic_id) ON DELETE SET NULL,
  payment_type VARCHAR(200) NOT NULL DEFAULT 'ชำระค่าสมาชิก',
  amount NUMERIC(12,2) NOT NULL CHECK(amount>0),
  paid_at TIMESTAMPTZ NOT NULL,
  slip_url TEXT,
  status VARCHAR(40) NOT NULL DEFAULT 'รอตรวจสอบการชำระ',
  verified_by VARCHAR(100), verified_at TIMESTAMPTZ, note TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);
ALTER TABLE IF EXISTS public.payments ADD COLUMN IF NOT EXISTS slip_url TEXT;

CREATE TABLE IF NOT EXISTS public.donations (
  donation_id VARCHAR(80) PRIMARY KEY,
  member_code VARCHAR(20) REFERENCES public.members(member_code) ON DELETE SET NULL,
  topic_id VARCHAR(50) REFERENCES public.donation_topics(topic_id) ON DELETE SET NULL,
  amount NUMERIC(12,2) NOT NULL CHECK(amount>0),
  donated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  slip_url TEXT,
  status VARCHAR(40) NOT NULL DEFAULT 'รอตรวจสอบ',
  verified_by VARCHAR(100), verified_at TIMESTAMPTZ, note TEXT,
  donor_name VARCHAR(250), phone VARCHAR(30), email VARCHAR(320),
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);
ALTER TABLE IF EXISTS public.donations ADD COLUMN IF NOT EXISTS slip_url TEXT;

CREATE TABLE IF NOT EXISTS public.news (
  news_id VARCHAR(80) PRIMARY KEY,
  category VARCHAR(30) NOT NULL DEFAULT 'ข่าวสาร',
  title VARCHAR(300) NOT NULL,
  content TEXT NOT NULL,
  publish_date TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS public.benefits (
  benefit_id VARCHAR(80) PRIMARY KEY,
  title VARCHAR(250) NOT NULL,
  description TEXT,
  start_date DATE,
  end_date DATE,
  active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS public.ledger_entries (
  entry_id VARCHAR(80) PRIMARY KEY,
  entry_date TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  entry_type VARCHAR(20) NOT NULL,
  category VARCHAR(200) NOT NULL,
  source VARCHAR(250), amount NUMERIC(14,2) NOT NULL CHECK(amount>0),
  reference_type VARCHAR(30), reference_id VARCHAR(80), member_code VARCHAR(20),
  description TEXT, note TEXT, created_by VARCHAR(100), status VARCHAR(20) NOT NULL DEFAULT 'posted',
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

INSERT INTO public.payment_topics(topic_id,title,description,active)
VALUES ('membership','ชำระค่าสมาชิก','ค่าบำรุงสมาชิกสมาคม',TRUE)
ON CONFLICT(topic_id) DO NOTHING;
INSERT INTO public.donation_topics(topic_id,title,description,active) VALUES
('general','กิจกรรมสมาคม','สนับสนุนกิจกรรมของสมาคม',TRUE),
('education','กองทุนการศึกษา','สนับสนุนกองทุนการศึกษา',TRUE)
ON CONFLICT(topic_id) DO NOTHING;

INSERT INTO public.app_settings(setting_key,setting_value,description) VALUES
('APP_VERSION','WEB-V2.0','เวอร์ชันระบบ'),
('APP_NAME','ระบบสมาชิกสมาคมศิษย์เก่า นูรุ้ลอิสลามสัมพันธ์ (สุเหร่าเขียว)','ชื่อระบบ')
ON CONFLICT(setting_key) DO UPDATE SET setting_value=EXCLUDED.setting_value;
