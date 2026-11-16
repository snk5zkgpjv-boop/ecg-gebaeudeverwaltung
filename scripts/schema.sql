-- ECG database baseline. Idempotent for an empty PostgreSQL database.
-- This is a development/bootstrap schema, not a production migration or backup.
-- Never run against live production without separate review and a complete backup.

CREATE TABLE IF NOT EXISTS app_state (
  id text PRIMARY KEY,
  data jsonb NOT NULL DEFAULT '{}'::jsonb,
  revision bigint NOT NULL DEFAULT 1,
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS ecg_app_users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  app_user_id text NOT NULL UNIQUE,
  email text NOT NULL,
  name text NOT NULL,
  password_hash text NOT NULL,
  must_change_password boolean NOT NULL DEFAULT true,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS ecg_app_users_email_lower_uq ON ecg_app_users ((lower(email)));
CREATE TABLE IF NOT EXISTS ecg_app_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES ecg_app_users(id) ON DELETE CASCADE,
  token_hash text NOT NULL UNIQUE,
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS ecg_password_resets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES ecg_app_users(id) ON DELETE CASCADE,
  token_hash text NOT NULL UNIQUE,
  expires_at timestamptz NOT NULL,
  used_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS ecg_auth_rate_limits (
  id text PRIMARY KEY,
  attempts integer NOT NULL,
  window_start timestamptz NOT NULL DEFAULT now()
);


-- Source: scripts/staff-schema.sql
CREATE TABLE IF NOT EXISTS ecg_staff (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 name text NOT NULL CHECK (length(trim(name)) BETWEEN 1 AND 120),
 duty text NOT NULL DEFAULT '',
 employment text NOT NULL CHECK (employment IN ('Offen','Vollzeit','Teilzeit','Minijob','Sonstige')),
 hourly boolean NOT NULL DEFAULT false
);
CREATE UNIQUE INDEX IF NOT EXISTS ecg_staff_name_key ON ecg_staff(lower(trim(name)));


-- Source: scripts/personnel-schema.sql
CREATE TABLE IF NOT EXISTS ecg_absences (
 id uuid PRIMARY KEY,
 owner_id text NOT NULL,
 team text NOT NULL CHECK(team IN ('pastoral','building')),
 kind text NOT NULL CHECK(kind IN ('Urlaub','Abwesenheit','Sabbatjahr')),
 starts date NOT NULL,
 ends date NOT NULL CHECK(ends >= starts),
 status text NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','approved','declined','cancelled')),
 deputy_id text,
 coverage text NOT NULL DEFAULT 'open' CHECK(coverage IN ('open','asked','confirmed','declined')),
 decided_by text,
 version integer NOT NULL DEFAULT 1
);


-- Source: scripts/coverage-schema.sql
ALTER TABLE ecg_staff ADD COLUMN IF NOT EXISTS account_id text;
CREATE UNIQUE INDEX IF NOT EXISTS ecg_staff_account_key ON ecg_staff(account_id) WHERE account_id IS NOT NULL;
ALTER TABLE ecg_staff ADD COLUMN IF NOT EXISTS cover_group text NOT NULL DEFAULT '' CHECK(cover_group IN ('','cleaning','caretaker'));
ALTER TABLE ecg_staff ADD COLUMN IF NOT EXISTS handover text NOT NULL DEFAULT '';
ALTER TABLE ecg_absences ADD COLUMN IF NOT EXISTS handover text NOT NULL DEFAULT '';
ALTER TABLE ecg_absences ADD COLUMN IF NOT EXISTS planned_staff uuid REFERENCES ecg_staff(id);


-- Source: scripts/members-schema.sql
CREATE TABLE IF NOT EXISTS ecg_members (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 account_id text UNIQUE,
 data jsonb NOT NULL,
 photo text,
 version integer NOT NULL DEFAULT 1
);
CREATE UNIQUE INDEX IF NOT EXISTS ecg_members_identity ON ecg_members
 (lower(trim(data->>'name')), (data->>'birthDate'), lower(trim(data->>'email')));


-- Source: scripts/duties-schema.sql
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


-- Source: scripts/finance-pilot-schema.sql
-- Exclusive ECG synthetic pilot. Fixed sample receipts, no bank or RH integration.
CREATE TABLE IF NOT EXISTS ecg_demo_expenses (
 receipt_id text PRIMARY KEY CHECK(receipt_id IN ('M-001','M-002','M-003')),
 status text NOT NULL CHECK(status IN ('eingereicht','freigegeben','gebucht')),
 submitted_at timestamptz NOT NULL DEFAULT now(),
 approved_at timestamptz,
 booked_at timestamptz,
 journal_id text UNIQUE,
 CHECK ((status='eingereicht' AND approved_at IS NULL AND booked_at IS NULL AND journal_id IS NULL)
     OR (status='freigegeben' AND approved_at IS NOT NULL AND booked_at IS NULL AND journal_id IS NULL)
     OR (status='gebucht' AND approved_at IS NOT NULL AND booked_at IS NOT NULL AND journal_id='TEST-'||receipt_id AND journal_id IS NOT NULL))
);


-- Runtime schema: lib/maintenance-documents.js
CREATE TABLE IF NOT EXISTS ecg_maintenance_documents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  asset_id text NOT NULL,
  title text NOT NULL,
  filename text NOT NULL,
  size integer NOT NULL,
  sha256 text NOT NULL,
  pdf_base64 text NOT NULL,
  created_by text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  removed_at timestamptz,
  removed_by text,
  UNIQUE (asset_id, sha256)
);

-- Existing operator repair journal: schema observed read-only on 2026-11-16.
CREATE TABLE IF NOT EXISTS ecg_data_repairs (
  repair_id text PRIMARY KEY,
  entry_id text NOT NULL,
  before_entry jsonb NOT NULL,
  after_entry jsonb NOT NULL,
  reason text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
