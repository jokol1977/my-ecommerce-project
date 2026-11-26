#!/usr/bin/env bash
set -euo pipefail

project_dir="$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)"
source "$project_dir/scripts/backup-destination.sh"
require_protected_production_env_file "$project_dir/.env.production"
backup_dir="$(require_independent_backup_directory "$project_dir")"
backup_set_id="${BACKUP_SET_ID:-$(date -u +%Y%m%dT%H%M%SZ)_$$}"
backup_set_id_pattern='^[A-Za-z0-9][A-Za-z0-9._-]{0,79}$'
backup_file="$backup_dir/janankadeh_${backup_set_id}.dump.age"
temporary_file=""
temporary_directory=""

if [[ ! "$backup_set_id" =~ $backup_set_id_pattern ]]; then
  printf 'BACKUP_SET_ID contains unsupported characters.\n' >&2
  exit 1
fi
if [[ -e "$backup_file" ]]; then
  printf 'Backup already exists; choose a new BACKUP_SET_ID: %s\n' "$backup_file" >&2
  exit 1
fi
if [[ -z "${AGE_RECIPIENT:-}" ]]; then
  printf 'Set AGE_RECIPIENT before creating an encrypted production backup.\n' >&2
  exit 1
fi
command -v docker >/dev/null || { printf 'Docker CLI is required.\n' >&2; exit 1; }
command -v age >/dev/null || { printf 'age is required for encrypted backups.\n' >&2; exit 1; }

compose() {
  docker compose \
    --project-directory "$project_dir" \
    --file "$project_dir/compose.yaml" \
    --project-name janankadeh \
    --env-file "$project_dir/.env.production" \
    "$@"
}

for service in web order-expiry-scheduler; do
  running_service="$(docker ps \
    --filter label=com.docker.compose.project=janankadeh \
    --filter "label=com.docker.compose.service=$service" \
    --quiet)"
  if [[ -n "$running_service" ]]; then
    printf 'Stop the janankadeh %s service before creating a consistent database and image backup pair.\n' "$service" >&2
    exit 1
  fi
done

umask 077
temporary_directory="$(mktemp -d "$backup_dir/.janankadeh_backup.XXXXXXXX")"
temporary_file="$temporary_directory/archive.dump.age"
trap 'rm -f -- "$temporary_file"; rmdir -- "$temporary_directory" 2>/dev/null || true' EXIT HUP INT TERM

compose exec -T database \
  sh -lc 'PGPASSWORD="$APP_DB_PASSWORD" pg_dump -h 127.0.0.1 -U janan_app -d janankadeh -Fc' \
  | age --recipient "$AGE_RECIPIENT" --output "$temporary_file"

if [[ ! -s "$temporary_file" ]]; then
  printf 'Encrypted database archive is missing or empty.\n' >&2
  exit 1
fi
if [[ -e "$backup_file" ]]; then
  printf 'Backup already exists; choose a new BACKUP_SET_ID: %s\n' "$backup_file" >&2
  exit 1
fi

ln -- "$temporary_file" "$backup_file"
rm -- "$temporary_file"
rmdir -- "$temporary_directory"
temporary_file=""
temporary_directory=""
trap - EXIT HUP INT TERM
printf 'Encrypted production database backup created for set %s: %s\n' "$backup_set_id" "$backup_file"
