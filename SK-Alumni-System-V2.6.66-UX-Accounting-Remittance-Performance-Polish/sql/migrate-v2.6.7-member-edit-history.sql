CREATE TABLE IF NOT EXISTS public.member_edit_history (
  edit_id TEXT PRIMARY KEY,
  member_code TEXT NOT NULL REFERENCES public.members(member_code) ON UPDATE CASCADE ON DELETE CASCADE,
  changed_fields TEXT[] NOT NULL DEFAULT '{}',
  change_summary TEXT,
  source TEXT NOT NULL DEFAULT 'member_portal',
  old_data JSONB,
  new_data JSONB,
  changed_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS member_edit_history_member_changed_idx ON public.member_edit_history(member_code, changed_at DESC);
