-- Events (replaces appointments). Run once.
BEGIN;
CREATE TABLE events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES neon_auth."user"(id) ON DELETE CASCADE,
  type text NOT NULL CHECK (type IN ('bookkeeping','appointment','adhoc','reminder')),
  title text NOT NULL,
  event_date date NOT NULL,            -- appointment day, or upload-by / reminder date
  start_time time,                     -- appointment only (Asia/Kuala_Lumpur)
  duration_min integer,                -- appointment only
  period date,                         -- bookkeeping only (first day of month)
  submitted_at timestamptz,            -- bookkeeping / adhoc: set when client uploads
  return_date date,                    -- bookkeeping only: (submitted_at or event_date) + 15 days
  notes text,
  status text NOT NULL DEFAULT 'scheduled' CHECK (status IN ('scheduled','completed','cancelled')),
  repeat text CHECK (repeat IN ('weekly','monthly','yearly')),
  repeat_until date,
  series_id uuid,
  reminders_sent integer[] NOT NULL DEFAULT '{}',
  created_by uuid NOT NULL REFERENCES neon_auth."user"(id),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_events_user_date ON events (user_id, event_date);
CREATE INDEX idx_events_series ON events (series_id);

INSERT INTO events (id, user_id, type, title, event_date, start_time, duration_min, notes, status, created_by, created_at)
SELECT id, user_id, 'appointment', title,
  (start_at AT TIME ZONE 'Asia/Kuala_Lumpur')::date,
  (start_at AT TIME ZONE 'Asia/Kuala_Lumpur')::time,
  (EXTRACT(EPOCH FROM (end_at - start_at)) / 60)::int,
  notes, status, created_by, created_at
FROM appointments;

ALTER TABLE bank_statements ADD COLUMN event_id uuid REFERENCES events(id) ON DELETE SET NULL;
DROP TABLE appointments;
COMMIT;
