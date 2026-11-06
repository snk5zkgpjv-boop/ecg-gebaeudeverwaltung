ALTER TABLE ecg_staff ADD COLUMN IF NOT EXISTS account_id text;
CREATE UNIQUE INDEX IF NOT EXISTS ecg_staff_account_key ON ecg_staff(account_id) WHERE account_id IS NOT NULL;
ALTER TABLE ecg_staff ADD COLUMN IF NOT EXISTS cover_group text NOT NULL DEFAULT '' CHECK(cover_group IN ('','cleaning','caretaker'));
ALTER TABLE ecg_staff ADD COLUMN IF NOT EXISTS handover text NOT NULL DEFAULT '';
ALTER TABLE ecg_absences ADD COLUMN IF NOT EXISTS handover text NOT NULL DEFAULT '';
ALTER TABLE ecg_absences ADD COLUMN IF NOT EXISTS planned_staff uuid REFERENCES ecg_staff(id);
