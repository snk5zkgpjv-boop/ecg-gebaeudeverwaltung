-- ECG-Auslagen: getrennt vom synthetischen Finanzpiloten.
-- Vor Einsatz mit realen Finanzdaten gesonderte Datenschutz-/Backup-Freigabe.
CREATE TABLE IF NOT EXISTS ecg_expense_claims (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  applicant_id text NOT NULL,
  submission_key uuid NOT NULL,
  UNIQUE(applicant_id,submission_key),
  applicant_name text NOT NULL,
  items jsonb NOT NULL CHECK (jsonb_typeof(items) = 'array'),
  bank_iban text NOT NULL DEFAULT '',
  bank_owner text NOT NULL DEFAULT '',
  reimbursement_type text NOT NULL DEFAULT 'refund' CHECK (reimbursement_type IN ('refund','waiver')),
  total_cents integer NOT NULL CHECK (total_cents > 0),
  status text NOT NULL DEFAULT 'submitted' CHECK (status IN ('submitted','question','approved','rejected','paid')),
  note text NOT NULL DEFAULT '',
  reviewer_id text,
  approved_at timestamptz,
  paid_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS ecg_expenses_applicant_idx ON ecg_expense_claims(applicant_id,created_at DESC);
CREATE INDEX IF NOT EXISTS ecg_expenses_status_idx ON ecg_expense_claims(status,created_at DESC);
CREATE TABLE IF NOT EXISTS ecg_expense_receipts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  claim_id uuid NOT NULL REFERENCES ecg_expense_claims(id) ON DELETE CASCADE,
  original_name text NOT NULL,
  content_type text NOT NULL,
  content bytea NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS ecg_expense_audit (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  claim_id uuid NOT NULL REFERENCES ecg_expense_claims(id) ON DELETE CASCADE,
  actor_id text NOT NULL,
  event text NOT NULL,
  note text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now()
);
-- Limit paid document recognition requests per member and calendar day.
CREATE TABLE IF NOT EXISTS ecg_expense_scan_quota (
 applicant_id text NOT NULL,
 day date NOT NULL DEFAULT CURRENT_DATE,
 requests integer NOT NULL DEFAULT 1 CHECK(requests BETWEEN 1 AND 10),
 PRIMARY KEY(applicant_id,day)
);
