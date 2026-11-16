-- ECG: additive, reversible preparation for splitting the large app_state JSONB.
-- No tables in this file become authoritative automatically. Never DROP/DELETE
-- source JSONB fields before an operator-verified database restore.
CREATE TABLE IF NOT EXISTS ecg_issue_records (
  id text PRIMARY KEY,
  sort_order integer NOT NULL CHECK (sort_order >= 0),
  room_id text NOT NULL DEFAULT '',
  status text NOT NULL DEFAULT '',
  payload jsonb NOT NULL CHECK (jsonb_typeof(payload)='object'),
  source_revision bigint NOT NULL
);
CREATE INDEX IF NOT EXISTS ecg_issue_records_room ON ecg_issue_records(room_id);
CREATE INDEX IF NOT EXISTS ecg_issue_records_status ON ecg_issue_records(status);

CREATE TABLE IF NOT EXISTS ecg_issue_photos (
  issue_id text PRIMARY KEY REFERENCES ecg_issue_records(id) ON DELETE CASCADE,
  image_data_url text NOT NULL,
  source_revision bigint NOT NULL
);

CREATE TABLE IF NOT EXISTS ecg_room_records (
  id text PRIMARY KEY,
  sort_order integer NOT NULL CHECK(sort_order >= 0),
  payload jsonb NOT NULL CHECK(jsonb_typeof(payload)='object'),
  source_revision bigint NOT NULL
);

CREATE TABLE IF NOT EXISTS ecg_time_records (
  id text PRIMARY KEY,
  sort_order integer NOT NULL CHECK(sort_order >= 0),
  user_id text NOT NULL,
  starts_at timestamptz,
  ends_at timestamptz,
  payload jsonb NOT NULL CHECK(jsonb_typeof(payload)='object'),
  source_revision bigint NOT NULL
);
CREATE INDEX IF NOT EXISTS ecg_time_records_owner_start ON ecg_time_records(user_id,starts_at);

CREATE TABLE IF NOT EXISTS ecg_kitchen_photos (
  photo_key text PRIMARY KEY,
  jpeg_base64 text NOT NULL,
  source_revision bigint NOT NULL
);

CREATE TABLE IF NOT EXISTS ecg_split_migration_checks (
  snapshot_revision bigint PRIMARY KEY,
  captured_at timestamptz NOT NULL DEFAULT now(),
  issue_count integer NOT NULL,
  issue_photo_count integer NOT NULL,
  room_count integer NOT NULL,
  time_count integer NOT NULL,
  kitchen_photo_count integer NOT NULL,
  status text NOT NULL DEFAULT 'shadow' CHECK(status IN ('shadow','verified'))
);
