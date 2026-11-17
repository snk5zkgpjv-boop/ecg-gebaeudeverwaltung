-- Operator-only: run AFTER an application-wide write stop and a fresh pg_dump.
-- Replaces ONLY stale issue shadow rows; app_state.data->'issues' remains unchanged.
-- This script never runs as part of a deployment.
BEGIN;
LOCK TABLE app_state IN SHARE MODE;
LOCK TABLE ecg_issue_records, ecg_issue_photos IN SHARE ROW EXCLUSIVE MODE;
DO $$
BEGIN
 IF (SELECT jsonb_typeof(data->'issues') FROM app_state WHERE id='main') IS DISTINCT FROM 'array'
 THEN RAISE EXCEPTION 'Issue JSONB array missing; cutover refused'; END IF;
 IF EXISTS (SELECT id FROM (SELECT item->>'id' AS id FROM app_state,
   LATERAL jsonb_array_elements(data->'issues') AS item WHERE app_state.id='main') a
   GROUP BY id HAVING id IS NULL OR id='' OR count(*)>1)
 THEN RAISE EXCEPTION 'Missing or duplicated issue IDs; cutover refused'; END IF;
END $$;
DELETE FROM ecg_issue_photos;
DELETE FROM ecg_issue_records;
INSERT INTO ecg_issue_records(id,sort_order,room_id,status,payload,source_revision)
SELECT item->>'id',(ordinality-1)::integer,coalesce(item->>'roomId',''),
  coalesce(item->>'status',''),
  CASE WHEN jsonb_typeof(item->'photo')='string' AND item->>'photo'<>''
       THEN item-'photo' ELSE item END, a.revision
FROM app_state a CROSS JOIN LATERAL jsonb_array_elements(a.data->'issues')
 WITH ORDINALITY AS x(item,ordinality) WHERE a.id='main';
INSERT INTO ecg_issue_photos(issue_id,image_data_url,source_revision)
SELECT item->>'id',item->>'photo',a.revision
FROM app_state a CROSS JOIN LATERAL jsonb_array_elements(a.data->'issues') item
WHERE a.id='main' AND jsonb_typeof(item->'photo')='string' AND item->>'photo'<>'';
DO $$
DECLARE old_issues jsonb; reconstructed jsonb;
BEGIN
 SELECT data->'issues' INTO old_issues FROM app_state WHERE id='main';
 SELECT coalesce(jsonb_agg(r.payload ||
    CASE WHEN p.issue_id IS NULL THEN '{}'::jsonb
         ELSE jsonb_build_object('photo',p.image_data_url) END
    ORDER BY r.sort_order),'[]'::jsonb) INTO reconstructed
 FROM ecg_issue_records r LEFT JOIN ecg_issue_photos p ON p.issue_id=r.id;
 IF old_issues IS DISTINCT FROM reconstructed
 THEN RAISE EXCEPTION 'Issue forward-copy mismatch; transaction rolled back'; END IF;
END $$;
COMMIT;
