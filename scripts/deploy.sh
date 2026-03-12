#!/bin/bash
# Deploy Pulse to production (OrbStack Docker)
# Backs up the database first, then rebuilds and restarts containers.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"

cd "$PROJECT_DIR"

echo "==> Backing up production database..."
bash "$SCRIPT_DIR/backup-db.sh" || echo "Warning: backup failed (container may not be running yet)"

echo "==> Pulling latest code..."
git pull origin main

echo "==> Rebuilding containers..."
docker compose --env-file .env.production build --no-cache

echo "==> Restarting containers..."
docker compose --env-file .env.production up -d

echo "==> Waiting for API health check..."
for i in $(seq 1 15); do
  if curl -sf http://localhost:8147/health >/dev/null 2>&1; then
    echo "==> Deploy complete! App running at http://localhost:8147"
    exit 0
  fi
  sleep 2
done

echo "Error: API failed to start. Check logs with: docker compose --env-file .env.production logs api"
exit 1
