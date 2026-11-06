CREATE TABLE IF NOT EXISTS ecg_members (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 account_id text UNIQUE,
 data jsonb NOT NULL,
 photo text,
 version integer NOT NULL DEFAULT 1
);
CREATE UNIQUE INDEX IF NOT EXISTS ecg_members_identity ON ecg_members
 (lower(trim(data->>'name')), (data->>'birthDate'), lower(trim(data->>'email')));
