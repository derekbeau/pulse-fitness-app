#!/bin/bash
# Backup the production Pulse database from Docker volume to /Volumes/Storage
set -euo pipefail

BACKUP_DIR="/Volumes/Storage/backups/pulse"
CONTAINER="pulse-fitness-app-api-1"
TIMESTAMP=$(date +%Y%m%d-%H%M%S)
BACKUP_FILE="${BACKUP_DIR}/pulse-${TIMESTAMP}.db"

# Ensure backup dir exists
mkdir -p "$BACKUP_DIR"

# Check container is running
if ! docker inspect "$CONTAINER" &>/dev/null; then
  echo "Error: Container $CONTAINER not found" >&2
  exit 1
fi

# Use sqlite3 .backup inside the container for a consistent snapshot,
# then copy it out. This avoids WAL consistency issues.
docker exec "$CONTAINER" sh -c "
  if command -v sqlite3 >/dev/null 2>&1; then
    sqlite3 /data/pulse.db '.backup /tmp/pulse-backup.db'
  else
    cp /data/pulse.db /tmp/pulse-backup.db
  fi
"
docker cp "$CONTAINER:/tmp/pulse-backup.db" "$BACKUP_FILE"
docker exec "$CONTAINER" rm -f /tmp/pulse-backup.db

# Keep only the last 30 backups
ls -t "$BACKUP_DIR"/pulse-*.db 2>/dev/null | tail -n +31 | xargs rm -f 2>/dev/null || true

echo "Backed up to $BACKUP_FILE ($(du -h "$BACKUP_FILE" | cut -f1))"
