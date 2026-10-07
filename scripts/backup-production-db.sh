#!/bin/sh
set -eu

project_dir="$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)"
backup_dir="${JANANKADEH_BACKUP_DIR:-$project_dir/backups/production}"
timestamp="$(date -u +%Y%m%dT%H%M%SZ)_$$"

umask 077
mkdir -p -- "$backup_dir"
temporary_file="$(mktemp "$backup_dir/.janankadeh_backup.XXXXXXXX.dump")"
backup_file="$backup_dir/janankadeh_$timestamp.dump"
trap 'rm -f -- "$temporary_file"' EXIT HUP INT TERM

docker compose --env-file "$project_dir/.env.production" exec -T database \
  sh -lc 'PGPASSWORD="$APP_DB_PASSWORD" pg_dump -h 127.0.0.1 -U janan_app -d janankadeh -Fc' \
  > "$temporary_file"

docker compose --env-file "$project_dir/.env.production" exec -T database \
  pg_restore --list - < "$temporary_file" > /dev/null

mv -- "$temporary_file" "$backup_file"
trap - EXIT HUP INT TERM
printf 'Production backup created and archive catalog verified: %s\n' "$backup_file"
