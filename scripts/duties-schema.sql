CREATE TABLE IF NOT EXISTS ecg_event_duties (
 id uuid PRIMARY KEY,
 event_id text NOT NULL,
 event_title text NOT NULL,
 starts_at timestamptz NOT NULL,
 ends_at timestamptz NOT NULL CHECK(ends_at >= starts_at),
 label text NOT NULL CHECK(length(trim(label)) BETWEEN 1 AND 120),
 assignee text NOT NULL,
 requested_by text NOT NULL,
 status text NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','accepted','declined','withdrawn')),
 version integer NOT NULL DEFAULT 1
);
CREATE UNIQUE INDEX IF NOT EXISTS ecg_event_duty_slot ON ecg_event_duties(event_id,lower(trim(label)),assignee) WHERE status IN ('pending','accepted');
CREATE INDEX IF NOT EXISTS ecg_event_duty_inbox ON ecg_event_duties(assignee,starts_at);
