#!/bin/bash
# Back up the SQLite database and encrypted private media as one archive.
# BODY_PROGRESS_MEDIA_KEY is intentionally excluded and must be protected separately.
set -euo pipefail

BACKUP_DIR="/Volumes/Storage/backups/pulse"
CONTAINER="pulse-fitness-app-api-1"
TIMESTAMP=$(date +%Y%m%d-%H%M%S)
BACKUP_FILE="${BACKUP_DIR}/pulse-${TIMESTAMP}.tar.gz"

# Ensure backup dir exists
mkdir -p "$BACKUP_DIR"

# Check container is running
if ! docker inspect "$CONTAINER" &>/dev/null; then
  echo "Error: Container $CONTAINER not found" >&2
  exit 1
fi

# Use sqlite3 .backup for a consistent database snapshot, then archive it with
# the ciphertext tree. Failure to include either component fails the backup.
docker exec "$CONTAINER" sh -c "
  set -eu
  rm -rf /tmp/pulse-backup
  mkdir -p /tmp/pulse-backup/private/body-progress
  if command -v sqlite3 >/dev/null 2>&1; then
    sqlite3 /data/pulse.db '.backup /tmp/pulse-backup/pulse.db'
  else
    cp /data/pulse.db /tmp/pulse-backup/pulse.db
  fi
  test -r /data/private/body-progress
  cp -a /data/private/body-progress/. /tmp/pulse-backup/private/body-progress/
  printf '%s\n' 'format=pulse-backup-v2' 'media_key_included=false' 'retention=newest-30-archives' > /tmp/pulse-backup/manifest.txt
  tar -C /tmp/pulse-backup -czf /tmp/pulse-backup.tar.gz manifest.txt pulse.db private/body-progress
"
docker cp "$CONTAINER:/tmp/pulse-backup.tar.gz" "$BACKUP_FILE"
docker exec "$CONTAINER" rm -rf /tmp/pulse-backup /tmp/pulse-backup.tar.gz

# Keep only the last 30 backups
ls -t "$BACKUP_DIR"/pulse-*.tar.gz 2>/dev/null | tail -n +31 | xargs rm -f 2>/dev/null || true

echo "Backed up to $BACKUP_FILE ($(du -h "$BACKUP_FILE" | cut -f1))"
