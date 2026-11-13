#!/usr/bin/env bash
# Read-only monitor for remote encrypted archives.
set -Eeuo pipefail
command -v rclone >/dev/null
: "${BACKUP_RCLONE_DEST:?Expected remote:prefix}"
max_hours="${BACKUP_MAX_AGE_HOURS:-26}"
[[ "$max_hours" =~ ^[0-9]+$ ]] || exit 2
now="$(date -u +%s)"
latest=0
while IFS= read -r name; do
  if [[ "$name" =~ ^ecg-([0-9]{8})T([0-9]{6})Z-.*\.dump\.age$ ]]; then
    ts="$(date -u -d "${BASH_REMATCH[1]:0:4}-${BASH_REMATCH[1]:4:2}-${BASH_REMATCH[1]:6:2} ${BASH_REMATCH[2]:0:2}:${BASH_REMATCH[2]:2:2}:${BASH_REMATCH[2]:4:2} UTC" +%s)"
    (( ts > latest )) && latest="$ts"
  fi
done < <(rclone lsf "${BACKUP_RCLONE_DEST%/}/" --files-only)
if (( latest == 0 || now - latest > max_hours * 3600 || latest > now + 300 )); then
  echo "CRITICAL: no recent encrypted backup (threshold ${max_hours}h)" >&2
  exit 1
fi
echo "OK: latest encrypted backup $(date -u -d "@$latest" +%FT%TZ)"
