-- ECG migration readiness catalogue. Must run with default_transaction_read_only=on.
-- No raw application rows, user names, emails, hostnames, credentials or object contents.
BEGIN TRANSACTION READ ONLY;

SELECT current_setting('server_version') AS postgres_version,
       current_setting('transaction_read_only') AS read_only_session,
       current_setting('TimeZone') AS database_timezone;

SELECT n.nspname AS schema_name,
       count(*) FILTER (WHERE c.relkind IN ('r','p')) AS tables,
       count(*) FILTER (WHERE c.relkind='v') AS views,
       count(*) FILTER (WHERE c.relkind='S') AS sequences
FROM pg_namespace n
LEFT JOIN pg_class c ON c.relnamespace=n.oid
WHERE n.nspname NOT IN ('pg_catalog','information_schema')
  AND n.nspname NOT LIKE 'pg_toast%' AND n.nspname NOT LIKE 'pg_temp%'
GROUP BY n.nspname ORDER BY n.nspname;

SELECT n.nspname AS schema_name,
       c.relname AS table_name,
       pg_total_relation_size(c.oid) AS total_bytes,
       coalesce(s.n_live_tup,0) AS estimated_rows
FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
LEFT JOIN pg_stat_user_tables s ON s.relid=c.oid
WHERE c.relkind IN ('r','p') AND n.nspname NOT IN ('pg_catalog','information_schema')
  AND n.nspname NOT LIKE 'pg_toast%'
ORDER BY total_bytes DESC, schema_name, table_name;

SELECT extname, extversion FROM pg_extension ORDER BY extname;

SELECT n.nspname AS schema_name, c.relname AS table_name,
       count(*) FILTER (WHERE con.contype='f') AS foreign_keys,
       count(*) FILTER (WHERE con.contype='c') AS check_constraints,
       count(*) FILTER (WHERE con.contype='p') AS primary_keys,
       count(*) FILTER (WHERE NOT con.convalidated) AS unvalidated_constraints
FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
LEFT JOIN pg_constraint con ON con.conrelid=c.oid
WHERE c.relkind IN ('r','p') AND n.nspname NOT IN ('pg_catalog','information_schema')
GROUP BY n.nspname,c.relname ORDER BY n.nspname,c.relname;

-- Report the size of specific JSONB top-level fields without exporting their values.
SELECT key, pg_column_size(value) AS bytes
FROM public.app_state, LATERAL jsonb_each(data) AS fields(key,value)
WHERE id='main' ORDER BY bytes DESC LIMIT 20;

COMMIT;
