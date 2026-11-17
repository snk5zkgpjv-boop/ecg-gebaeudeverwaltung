-- Operator-only rollback preparation. Stop ALL writes before executing.
-- Must run BEFORE selecting ISSUES_SOURCE=jsonb if issue tables have new changes.
-- Restores the complete current issue set (including photos) into JSONB; leaves
-- all unrelated app_state fields and tables unchanged.
BEGIN;
LOCK TABLE app_state IN SHARE ROW EXCLUSIVE MODE;
LOCK TABLE ecg_issue_records,ecg_issue_photos IN SHARE MODE;
DO $$
DECLARE new_issues jsonb; saved_issues jsonb;
BEGIN
 SELECT coalesce(jsonb_agg(r.payload ||
   CASE WHEN p.issue_id IS NULL THEN '{}'::jsonb
        ELSE jsonb_build_object('photo',p.image_data_url) END
   ORDER BY r.sort_order),'[]'::jsonb) INTO new_issues
 FROM ecg_issue_records r LEFT JOIN ecg_issue_photos p ON p.issue_id=r.id;
 IF EXISTS (SELECT id FROM ecg_issue_records GROUP BY id HAVING count(*)>1)
 THEN RAISE EXCEPTION 'Duplicate issue IDs; rollback copy refused'; END IF;
 UPDATE app_state SET data=jsonb_set(data,'{issues}',new_issues,true),
   revision=revision+1,updated_at=now()
 WHERE id='main' RETURNING data->'issues' INTO saved_issues;
 IF NOT FOUND OR new_issues IS DISTINCT FROM saved_issues
 THEN RAISE EXCEPTION 'Issue back-copy mismatch; transaction rolled back'; END IF;
END $$;
COMMIT;
