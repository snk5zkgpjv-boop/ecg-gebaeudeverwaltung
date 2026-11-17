-- ECG: an intentionally non-destructive one-time snapshot of app_state.
-- Run in a disposable, isolated test database first. Requires the schema in
-- scripts/schema.sql. This does not switch live application reads.
-- Refuse re-run on populated shadow tables to prevent overwriting newer data.
BEGIN;
DO $$
DECLARE
  state_record record;
  bad_ids bigint;
BEGIN
  SELECT revision, data INTO state_record FROM app_state WHERE id='main' FOR SHARE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Missing main application state'; END IF;
  IF jsonb_typeof(state_record.data->'issues') IS DISTINCT FROM 'array'
    OR jsonb_typeof(state_record.data->'rooms') IS DISTINCT FROM 'array'
    OR jsonb_typeof(state_record.data->'timeEntries') IS DISTINCT FROM 'array'
    OR jsonb_typeof(state_record.data->'kitchenPhotos') IS DISTINCT FROM 'object'
  THEN RAISE EXCEPTION 'Unexpected domain structure; migration refused'; END IF;
  IF EXISTS (SELECT 1 FROM ecg_issue_records)
    OR EXISTS (SELECT 1 FROM ecg_issue_photos)
    OR EXISTS (SELECT 1 FROM ecg_room_records)
    OR EXISTS (SELECT 1 FROM ecg_time_records)
    OR EXISTS (SELECT 1 FROM ecg_kitchen_photos)
  THEN RAISE EXCEPTION 'Shadow tables are not empty; migration refused'; END IF;
  SELECT count(*) INTO bad_ids FROM (
    SELECT id FROM (
      SELECT item->>'id' AS id FROM jsonb_array_elements(state_record.data->'issues') item
      UNION ALL
      SELECT item->>'id' AS id FROM jsonb_array_elements(state_record.data->'rooms') item
      UNION ALL
      SELECT item->>'id' AS id FROM jsonb_array_elements(state_record.data->'timeEntries') item
    ) raw
    WHERE id IS NULL OR id=''
  ) a;
  IF bad_ids>0 THEN RAISE EXCEPTION 'Missing item identifiers'; END IF;
  IF EXISTS (SELECT 1 FROM (
    SELECT item->>'id' AS id FROM jsonb_array_elements(state_record.data->'issues') item
    GROUP BY 1 HAVING count(*)>1
  ) d) OR EXISTS (SELECT 1 FROM (
    SELECT item->>'id' AS id FROM jsonb_array_elements(state_record.data->'rooms') item
    GROUP BY 1 HAVING count(*)>1
  ) d) OR EXISTS (SELECT 1 FROM (
    SELECT item->>'id' AS id FROM jsonb_array_elements(state_record.data->'timeEntries') item
    GROUP BY 1 HAVING count(*)>1
  ) d) THEN RAISE EXCEPTION 'Duplicate domain IDs; migration refused'; END IF;
END $$;

INSERT INTO ecg_issue_records(id,sort_order,room_id,status,payload,source_revision)
SELECT item->>'id', (n-1)::integer, coalesce(item->>'roomId',''),
  coalesce(item->>'status',''), CASE WHEN jsonb_typeof(item->'photo')='string' AND item->>'photo'<>'' THEN item-'photo' ELSE item END, a.revision
FROM app_state a CROSS JOIN LATERAL jsonb_array_elements(a.data->'issues') WITH ORDINALITY x(item,n)
WHERE a.id='main';

INSERT INTO ecg_issue_photos(issue_id,image_data_url,source_revision)
SELECT item->>'id', item->>'photo', a.revision
FROM app_state a CROSS JOIN LATERAL jsonb_array_elements(a.data->'issues') item
WHERE a.id='main' AND jsonb_typeof(item->'photo')='string'
  AND item->>'photo' <> '';

INSERT INTO ecg_room_records(id,sort_order,payload,source_revision)
SELECT item->>'id', (n-1)::integer, item, a.revision
FROM app_state a CROSS JOIN LATERAL jsonb_array_elements(a.data->'rooms') WITH ORDINALITY x(item,n)
WHERE a.id='main';

INSERT INTO ecg_time_records(id,sort_order,user_id,starts_at,ends_at,payload,source_revision)
SELECT item->>'id',(n-1)::integer,coalesce(item->>'userId',''),
  nullif(item->>'start','')::timestamptz,
  nullif(item->>'end','')::timestamptz,
  item,a.revision
FROM app_state a CROSS JOIN LATERAL jsonb_array_elements(a.data->'timeEntries') WITH ORDINALITY x(item,n)
WHERE a.id='main';

INSERT INTO ecg_kitchen_photos(photo_key,jpeg_base64,source_revision)
SELECT photo_key, photo_value #>> '{}', a.revision
FROM app_state a CROSS JOIN LATERAL jsonb_each(a.data->'kitchenPhotos') x(photo_key,photo_value)
WHERE a.id='main' AND jsonb_typeof(photo_value)='string';

INSERT INTO ecg_split_migration_checks(snapshot_revision,issue_count,issue_photo_count,room_count,time_count,kitchen_photo_count)
SELECT revision,
 (SELECT count(*) FROM ecg_issue_records)::integer,
 (SELECT count(*) FROM ecg_issue_photos)::integer,
 (SELECT count(*) FROM ecg_room_records)::integer,
 (SELECT count(*) FROM ecg_time_records)::integer,
 (SELECT count(*) FROM ecg_kitchen_photos)::integer
FROM app_state WHERE id='main';

-- Require identical row count and full JSONB equality when the side tables
-- are reconstituted, including images. jsonb equality is order-aware for arrays.
DO $$
DECLARE
  original jsonb;
  reconstructed jsonb;
  issue_total bigint;
  photos_total bigint;
  rooms_total bigint;
  times_total bigint;
  kitchen_total bigint;
BEGIN
  SELECT data INTO original FROM app_state WHERE id='main';
  SELECT coalesce(jsonb_agg(r.payload ||
    CASE WHEN p.issue_id IS NULL THEN '{}'::jsonb
      ELSE jsonb_build_object('photo',p.image_data_url) END
    ORDER BY r.sort_order),'[]'::jsonb) INTO reconstructed
  FROM ecg_issue_records r LEFT JOIN ecg_issue_photos p ON p.issue_id=r.id;
  IF reconstructed IS DISTINCT FROM original->'issues' THEN
    RAISE EXCEPTION 'Issue snapshot content mismatch'; END IF;
  SELECT coalesce(jsonb_agg(payload ORDER BY sort_order),'[]'::jsonb) INTO reconstructed FROM ecg_room_records;
  IF reconstructed IS DISTINCT FROM original->'rooms' THEN
    RAISE EXCEPTION 'Room snapshot content mismatch'; END IF;
  SELECT coalesce(jsonb_agg(payload ORDER BY sort_order),'[]'::jsonb) INTO reconstructed FROM ecg_time_records;
  IF reconstructed IS DISTINCT FROM original->'timeEntries' THEN
    RAISE EXCEPTION 'Time-entry snapshot content mismatch'; END IF;
  SELECT coalesce(jsonb_object_agg(photo_key,jpeg_base64),'{}'::jsonb) INTO reconstructed FROM ecg_kitchen_photos;
  IF reconstructed IS DISTINCT FROM original->'kitchenPhotos' THEN
    RAISE EXCEPTION 'Kitchen photo snapshot mismatch'; END IF;
END $$;
COMMIT;
