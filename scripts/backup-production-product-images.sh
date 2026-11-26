#!/usr/bin/env bash
set -euo pipefail

project_dir="$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)"
source "$project_dir/scripts/backup-destination.sh"
backup_dir="$(require_independent_backup_directory "$project_dir")"
backup_set_id="${BACKUP_SET_ID:-$(date -u +%Y%m%dT%H%M%SZ)_$$}"
backup_set_id_pattern='^[A-Za-z0-9][A-Za-z0-9._-]{0,79}$'
image_volume="janankadeh_product-images"
backup_file="$backup_dir/product-images_${backup_set_id}.tar.gz.age"
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
  printf 'Set AGE_RECIPIENT before creating an encrypted product image backup.\n' >&2
  exit 1
fi
command -v docker >/dev/null || { printf 'Docker CLI is required.\n' >&2; exit 1; }
command -v age >/dev/null || { printf 'age is required for encrypted backups.\n' >&2; exit 1; }
helper_image="${JANANKADEH_BACKUP_HELPER_IMAGE:-}"
if [[ -z "$helper_image" ]]; then
  helper_image="$(docker image inspect --format '{{.Id}}' alpine:3.22 2>/dev/null)" || {
    printf 'Preload and review alpine:3.22 before running an image backup; no image will be pulled automatically.\n' >&2
    exit 1
  }
fi
if [[ ! "$helper_image" =~ ^sha256:[a-f0-9]{64}$ ]]; then
  printf 'The product image backup helper must be a local immutable Docker image ID.\n' >&2
  exit 1
fi

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

volume_name="$(docker volume inspect --format '{{.Name}}' "$image_volume")"
if [[ "$volume_name" != "$image_volume" ]]; then
  printf 'Expected Docker volume %s, found %s.\n' "$image_volume" "$volume_name" >&2
  exit 1
fi

assert_volume_is_idle() {
  local users
  users="$(docker ps --filter "volume=$image_volume" --format '{{.Names}}')"
  if [[ -n "$users" ]]; then
    printf 'Docker containers are still using %s; stop them before backup.\n%s\n' "$image_volume" "$users" >&2
    return 1
  fi
}

assert_volume_is_idle
umask 077
temporary_directory="$(mktemp -d "$backup_dir/.product_images_backup.XXXXXXXX")"
temporary_file="$temporary_directory/archive.tar.gz.age"
trap 'rm -f -- "$temporary_file"; rmdir -- "$temporary_directory" 2>/dev/null || true' EXIT HUP INT TERM

docker run --rm \
  --pull=never \
  --network none \
  --volume "$image_volume:/source:ro" \
  "$helper_image" \
  sh -ec 'tar -czf - -C /source .' \
  | age --recipient "$AGE_RECIPIENT" --output "$temporary_file"

assert_volume_is_idle
if [[ ! -s "$temporary_file" ]]; then
  printf 'Encrypted product image archive is missing or empty.\n' >&2
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
printf 'Encrypted product image backup created for set %s: %s\n' "$backup_set_id" "$backup_file"
