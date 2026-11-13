#!/usr/bin/env bash
# Requires two externally created, isolated PostgreSQL service entries.
# Never use credentials pointing to production.
set -Eeuo pipefail
umask 077
: "${ECG_SYNTHETIC_SOURCE_SERVICE:?Required}"
: "${ECG_SYNTHETIC_TARGET_SERVICE:?Required}"
[[ "$ECG_SYNTHETIC_SOURCE_SERVICE" == *synthetic* && "$ECG_SYNTHETIC_TARGET_SERVICE" == *synthetic* ]] || {
  echo "Both service names must explicitly contain 'synthetic'." >&2; exit 2;
}
[[ "$ECG_SYNTHETIC_SOURCE_SERVICE" != "$ECG_SYNTHETIC_TARGET_SERVICE" ]] || exit 2
for cmd in pg_dump pg_restore psql sha256sum mktemp; do command -v "$cmd" >/dev/null || exit 2; done
tmp="$(mktemp -d)"; trap 'rm -rf -- "$tmp"' EXIT
PGSERVICE="$ECG_SYNTHETIC_SOURCE_SERVICE" pg_dump -Fc --no-owner --no-acl -f "$tmp/fixture.dump"
pg_restore -l "$tmp/fixture.dump" > "$tmp/objects.txt"
PGSERVICE="$ECG_SYNTHETIC_TARGET_SERVICE" pg_restore --no-owner --no-acl --single-transaction --exit-on-error -d "service=$ECG_SYNTHETIC_TARGET_SERVICE" "$tmp/fixture.dump"
for service in "$ECG_SYNTHETIC_SOURCE_SERVICE" "$ECG_SYNTHETIC_TARGET_SERVICE"; do
  PGSERVICE="$service" psql -X -Atqc "SELECT string_agg(tablename,',' ORDER BY tablename) FROM pg_tables WHERE schemaname='public'" > "$tmp/$service.tables"
done
cmp "$tmp/$ECG_SYNTHETIC_SOURCE_SERVICE.tables" "$tmp/$ECG_SYNTHETIC_TARGET_SERVICE.tables"
sha256sum "$tmp/fixture.dump"
echo "PASS: synthetic PostgreSQL archive restored and table inventory matched. Run further row/document/FK assertions before production acceptance."
