#!/usr/bin/env bash
set -Eeuo pipefail

project_dir="$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)"
source "$project_dir/scripts/backup-destination.sh"
backup_dir="$(require_independent_backup_directory "$project_dir")"
backup_set_id="$(date -u +%Y%m%dT%H%M%SZ)_$$"
web_was_running=0
scheduler_was_running=0
services_may_need_restore=0

if [[ -z "$backup_dir" ]]; then
  printf 'Set JANANKADEH_BACKUP_DIR to the protected backup destination.\n' >&2
  exit 1
fi
if [[ -z "${AGE_RECIPIENT:-}" ]]; then
  printf 'Set AGE_RECIPIENT before creating an encrypted backup pair.\n' >&2
  exit 1
fi
require_protected_production_env_file "$project_dir/.env.production"
for command_name in docker age flock; do
  command -v "$command_name" >/dev/null || {
    printf '%s is required to create a production backup pair.\n' "$command_name" >&2
    exit 1
  }
done
if ! printf '' | age --recipient "$AGE_RECIPIENT" >/dev/null 2>&1; then
  printf 'AGE_RECIPIENT is not accepted by age; refusing to stop production services.\n' >&2
  exit 1
fi
backup_helper_image="$(docker image inspect --format '{{.Id}}' alpine:3.22 2>/dev/null)" || {
  printf 'Preload and review alpine:3.22 before the maintenance window; refusing to stop services without a local image.\n' >&2
  exit 1
}
if [[ ! "$backup_helper_image" =~ ^sha256:[a-f0-9]{64}$ ]]; then
  printf 'Could not resolve alpine:3.22 to a local immutable image ID; refusing to stop services.\n' >&2
  exit 1
fi
export JANANKADEH_BACKUP_HELPER_IMAGE="$backup_helper_image"
image_volume="janankadeh_product-images"
volume_name="$(docker volume inspect --format '{{.Name}}' "$image_volume" 2>/dev/null)" || {
  printf 'Required product image volume %s is missing; refusing to stop services or create a database-only backup pair.\n' "$image_volume" >&2
  exit 1
}
if [[ "$volume_name" != "$image_volume" ]]; then
  printf 'Expected product image volume %s, found %s; refusing to stop services.\n' "$image_volume" "$volume_name" >&2
  exit 1
fi
compose() {
  docker compose \
    --project-directory "$project_dir" \
    --file "$project_dir/compose.yaml" \
    --project-name janankadeh \
    --env-file "$project_dir/.env.production" \
    "$@"
}

umask 077
exec 9>"$backup_dir/.backup-pair.lock"
if ! flock -n 9; then
  printf 'Another backup pair run is already in progress at %s.\n' "$backup_dir" >&2
  exit 1
fi

if [[ -n "$(compose ps --status running --quiet web)" ]]; then
  web_was_running=1
fi
if [[ -n "$(compose ps --status running --quiet order-expiry-scheduler)" ]]; then
  scheduler_was_running=1
fi

restore_services() {
  local status=0 web_id="" health="" attempt
  trap - EXIT HUP INT TERM
  set +e

  if (( web_was_running )); then
    compose start web || status=1
    if (( status == 0 )); then
      web_id="$(compose ps --quiet web)"
      for ((attempt = 0; attempt < 60; attempt++)); do
        if [[ -n "$web_id" ]]; then
          health="$(docker inspect --format '{{if .State.Health}}{{.State.Health.Status}}{{else}}none{{end}}' "$web_id" 2>/dev/null)"
        fi
        [[ "$health" == healthy || "$health" == unhealthy ]] && break
        sleep 2
      done
      if [[ "$health" != healthy ]]; then
        printf 'Web did not become healthy after backup (health=%s); scheduler remains stopped.\n' "${health:-unknown}" >&2
        status=1
      elif (( scheduler_was_running )); then
        compose start order-expiry-scheduler || status=1
      fi
    else
      printf 'Could not restart web after backup; scheduler remains stopped.\n' >&2
    fi
  elif (( scheduler_was_running )); then
    compose start order-expiry-scheduler || status=1
  fi

  return "$status"
}

on_exit() {
  local original_status=$?
  if (( services_may_need_restore )); then
    restore_services || original_status=1
  fi
  exit "$original_status"
}
trap on_exit EXIT
trap 'exit 129' HUP
trap 'exit 130' INT
trap 'exit 143' TERM

services_may_need_restore=1
if (( scheduler_was_running )); then
  compose stop order-expiry-scheduler
fi
if (( web_was_running )); then
  compose stop web
fi

export BACKUP_SET_ID="$backup_set_id"
export JANANKADEH_BACKUP_DIR="$backup_dir"
bash "$project_dir/scripts/backup-production-db.sh"
bash "$project_dir/scripts/backup-production-product-images.sh"

database_archive="$backup_dir/janankadeh_${backup_set_id}.dump.age"
images_archive="$backup_dir/product-images_${backup_set_id}.tar.gz.age"
if [[ ! -s "$database_archive" || ! -s "$images_archive" ]]; then
  printf 'Backup pair is incomplete; refusing to report success.\n' >&2
  exit 1
fi

printf 'Encrypted backup pair created for set %s:\n%s\n%s\n' \
  "$backup_set_id" "$database_archive" "$images_archive"
printf 'Copy both archives to an independent destination and verify them there.\n'
