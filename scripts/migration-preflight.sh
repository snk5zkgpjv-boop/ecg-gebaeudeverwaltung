#!/usr/bin/env bash
# ECG migration preflight: read-only metadata only. No dump, data rows or secrets.
set -Eeuo pipefail
umask 077

: "${PGSERVICE:?Set an explicit PostgreSQL service name (credentials outside repository)}"
command -v psql >/dev/null || { echo "psql is required" >&2; exit 2; }
[[ "$PGSERVICE" =~ ^[A-Za-z0-9_-]+$ ]] || { echo "Invalid PGSERVICE name" >&2; exit 2; }

# Fail closed if the server cannot enforce a read-only transaction.
export PGOPTIONS="-c default_transaction_read_only=on -c statement_timeout=10000 -c lock_timeout=2000 -c application_name=ecg_migration_preflight"

echo "ECG migration preflight — read-only PostgreSQL catalogue inspection"
echo "CAUTION: output contains database object names. Keep reports private."
PGSERVICE="$PGSERVICE" psql -X -v ON_ERROR_STOP=1 -P pager=off -f "$(dirname "$0")/migration-preflight.sql"

# Compare the canonical SQL table inventory with production using metadata
# only; no SQL generated from account data and no schema/data mutation.
schema_file="$(dirname "$0")/schema.sql"
mapfile -t expected_tables < <(grep -Eio 'CREATE[[:space:]]+TABLE[[:space:]]+IF[[:space:]]+NOT[[:space:]]+EXISTS[[:space:]]+[a-z][a-z0-9_]*' "$schema_file" | awk '{print $NF}' | sort -u)
[[ ${#expected_tables[@]} -gt 0 ]] || { echo "FAIL: no canonical tables found in schema.sql" >&2; exit 3; }
actual_tables="$(PGSERVICE="$PGSERVICE" psql -X -v ON_ERROR_STOP=1 -At -c "SELECT tablename FROM pg_tables WHERE schemaname='public' ORDER BY tablename")"
missing=0
for table in "${expected_tables[@]}"; do
  if ! grep -Fxq -- "$table" <<< "$actual_tables"; then
    echo "MISSING public.$table" >&2
    missing=$((missing+1))
  fi
done
if (( missing )); then
  echo "FAIL: $missing of ${#expected_tables[@]} canonical application tables missing; DO NOT MERGE" >&2
  exit 4
fi
echo "PASS: all ${#expected_tables[@]} tables from scripts/schema.sql exist in public (metadata only)."
echo "PASS: metadata query completed. This does NOT verify columns, backup integrity or cutover readiness."
