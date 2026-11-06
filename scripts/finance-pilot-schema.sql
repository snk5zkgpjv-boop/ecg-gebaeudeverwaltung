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
