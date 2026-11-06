CREATE TABLE IF NOT EXISTS ecg_staff (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 name text NOT NULL CHECK (length(trim(name)) BETWEEN 1 AND 120),
 duty text NOT NULL DEFAULT '',
 employment text NOT NULL CHECK (employment IN ('Offen','Vollzeit','Teilzeit','Minijob','Sonstige')),
 hourly boolean NOT NULL DEFAULT false
);
CREATE UNIQUE INDEX IF NOT EXISTS ecg_staff_name_key ON ecg_staff(lower(trim(name)));
