#!/bin/sh
set -eu

database_path="${DATABASE_URL:-/data/pulse.db}"
map_path="${BODY_WEIGHT_LEGACY_UNIT_MAP_PATH:-/run/pulse-secrets/body-weight-legacy-unit-map.json}"
app_root="${PULSE_APP_ROOT:-/app}"

# A reviewed map is sensitive and necessary only while migrating a non-empty legacy table.
# Let the application perform the authoritative schema/row checks; this container guard makes
# the deployment requirement explicit before Node starts and keeps all other startup states usable.
if [ -f "$database_path" ]; then
  has_body_weight="$(sqlite3 "$database_path" "SELECT count(*) FROM sqlite_master WHERE type='table' AND name='body_weight';")"
  if [ "$has_body_weight" = "1" ]; then
    has_weight_kg="$(sqlite3 "$database_path" "SELECT count(*) FROM pragma_table_info('body_weight') WHERE name='weight_kg';")"
    has_unit_at_entry="$(sqlite3 "$database_path" "SELECT count(*) FROM pragma_table_info('body_weight') WHERE name='unit_at_entry';")"
    legacy_rows="$(sqlite3 "$database_path" "SELECT count(*) FROM body_weight;")"
    if [ "$has_weight_kg" = "0" ] && [ "$has_unit_at_entry" = "0" ] && [ "$legacy_rows" -gt 0 ]; then
      BODY_WEIGHT_LEGACY_UNIT_MAP_PATH="$map_path" \
        node "$app_root/scripts/verify-body-weight-map-mount.mjs"
    fi
  fi
fi

if [ "${PULSE_ENTRYPOINT_PREFLIGHT_ONLY:-0}" = "1" ]; then
  exit 0
fi

exec node "$app_root/apps/api/dist/index.js"
