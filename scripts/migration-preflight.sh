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
echo "PASS: metadata query completed. This does NOT verify backup integrity or cutover readiness."
