#!/usr/bin/env bash
# Operator-run only. No production credentials or scheduled runs are provisioned here.
set -Eeuo pipefail
umask 077
for cmd in pg_dump pg_restore age rclone sha256sum date mktemp; do command -v "$cmd" >/dev/null || { echo "Missing: $cmd" >&2; exit 2; }; done
: "${PGSERVICE:?Set explicit source service name}"
: "${BACKUP_AGE_RECIPIENT:?Set age public recipient}"
: "${BACKUP_RCLONE_DEST:?Set private rclone remote:prefix}"
[[ "$BACKUP_RCLONE_DEST" == *:* ]] || { echo "Expected rclone remote:prefix" >&2; exit 2; }
[[ "$BACKUP_RCLONE_DEST" != *'..'* ]] || exit 2
dir="$(mktemp -d)"
trap 'rm -rf -- "$dir"' EXIT
stamp="$(date -u +%Y%m%dT%H%M%SZ)"
name="ecg-${stamp}-${PGSERVICE//[^a-zA-Z0-9_-]/_}.dump.age"
# No database URL or password passed on process command line.
PGSERVICE="$PGSERVICE" pg_dump --format=custom --no-owner --no-acl --file="$dir/data.dump"
pg_restore --list "$dir/data.dump" >/dev/null
age -r "$BACKUP_AGE_RECIPIENT" -o "$dir/$name" "$dir/data.dump"
sha256sum "$dir/$name" | sed "s|$dir/||" > "$dir/$name.sha256"
rclone copyto "$dir/$name" "${BACKUP_RCLONE_DEST%/}/$name" --immutable
rclone copyto "$dir/$name.sha256" "${BACKUP_RCLONE_DEST%/}/$name.sha256" --immutable
echo "Uploaded encrypted archive + checksum: $name"
# Expiration, alerting, key escrow and destination access remain operator tasks.
