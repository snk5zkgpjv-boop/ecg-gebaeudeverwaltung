#!/usr/bin/env bash
# Synthetic PostgreSQL dump/restore only; NEVER connect to production.
set -Eeuo pipefail
umask 077
: "${ECG_SYNTHETIC_SOURCE_SERVICE:?Required}"
: "${ECG_SYNTHETIC_TARGET_SERVICE:?Required}"
source_service="$ECG_SYNTHETIC_SOURCE_SERVICE"
target_service="$ECG_SYNTHETIC_TARGET_SERVICE"
[[ "$source_service" == *synthetic* && "$target_service" == *synthetic* ]] || {
  echo "Both service names must explicitly contain 'synthetic'." >&2; exit 2;
}
[[ "$source_service" != "$target_service" ]] || { echo "Source and target services must differ" >&2; exit 2; }
for cmd in pg_dump pg_restore psql sha256sum mktemp cmp; do
  command -v "$cmd" >/dev/null || { echo "Missing: $cmd" >&2; exit 2; }
done
tmp="$(mktemp -d)"
trap 'rm -rf -- "$tmp"' EXIT

# Names are not enough: check the actual connected database name before any operation.
check_synthetic_db() {
  local service="$1" db
  db="$(PGSERVICE="$service" psql -X -v ON_ERROR_STOP=1 -Atqc 'SELECT current_database()')"
  [[ "$db" == *synthetic* ]] || {
    echo "Refusing non-synthetic database for service $service" >&2; exit 2;
  }
}
check_synthetic_db "$source_service"
check_synthetic_db "$target_service"
PGSERVICE="$target_service" psql -X -v ON_ERROR_STOP=1 -Atqc \
  "SELECT CASE WHEN EXISTS (SELECT 1 FROM pg_tables WHERE schemaname NOT IN ('pg_catalog','information_schema')) THEN 'NONEMPTY' ELSE 'EMPTY' END" \
  | grep -qx EMPTY || { echo "Target must have no user tables" >&2; exit 2; }

PGSERVICE="$source_service" pg_dump -Fc --no-owner --no-acl -f "$tmp/fixture.dump"
pg_restore -l "$tmp/fixture.dump" > "$tmp/objects.txt"
PGSERVICE="$target_service" pg_restore --no-owner --no-acl \
  --single-transaction --exit-on-error -d "service=$target_service" "$tmp/fixture.dump"

# Canonical comparison: each table's full JSONB row values, independent of row order.
# Deliberately intended for small synthetic fixtures; string_agg is not a production-size audit.
fingerprint() {
  local service="$1" output="$2"
  PGSERVICE="$service" psql -X -v ON_ERROR_STOP=1 -Atq <<'SQL' > "$output"
SELECT format(
  'SELECT %L, count(*)::bigint, md5(coalesce(string_agg(md5(to_jsonb(t)::text), '''' ORDER BY md5(to_jsonb(t)::text)), '''')) FROM %I.%I t;',
  schemaname || '.' || tablename, schemaname, tablename
)
FROM pg_tables
WHERE schemaname NOT IN ('pg_catalog', 'information_schema')
ORDER BY schemaname, tablename
\gexec
SQL
}
fingerprint "$source_service" "$tmp/source.rows"
fingerprint "$target_service" "$tmp/target.rows"
cmp "$tmp/source.rows" "$tmp/target.rows"

# Check restored foreign keys and CHECK constraints were validated by PostgreSQL.
PGSERVICE="$target_service" psql -X -v ON_ERROR_STOP=1 -Atqc \
  "SELECT count(*) FROM pg_constraint WHERE contype IN ('f','c') AND NOT convalidated" \
  | grep -qx 0 || { echo "Unvalidated CHECK/FK constraints" >&2; exit 1; }

# Compare sequence state; a pg_dump/restore should preserve sequence last_value/is_called.
sequence_inventory() {
  local service="$1" output="$2"
  PGSERVICE="$service" psql -X -v ON_ERROR_STOP=1 -Atq <<'SQL' > "$output"
SELECT format('SELECT %L, last_value, is_called FROM %I.%I;',
  schemaname || '.' || sequencename, schemaname, sequencename)
FROM pg_sequences
WHERE schemaname NOT IN ('pg_catalog', 'information_schema')
ORDER BY schemaname, sequencename
\gexec
SQL
}
sequence_inventory "$source_service" "$tmp/source.sequences"
sequence_inventory "$target_service" "$tmp/target.sequences"
cmp "$tmp/source.sequences" "$tmp/target.sequences"

sha256sum "$tmp/fixture.dump"
echo "PASS: synthetic restore; table contents, sequence state and validated FK/CHECK constraints checked."
echo "NOT COVERED: external object files, database roles/privileges, sessions, app endpoints, remote archive integrity."
