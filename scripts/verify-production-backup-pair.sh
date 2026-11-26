#!/usr/bin/env bash
set -euo pipefail

if [[ $# -ne 1 ]]; then
  printf 'Usage: %s <backup-directory>\n' "$0" >&2
  exit 2
fi
if [[ -z "${BACKUP_SET_ID:-}" || ! "$BACKUP_SET_ID" =~ ^[A-Za-z0-9][A-Za-z0-9._-]{0,79}$ ]]; then
  printf 'Set BACKUP_SET_ID to the identifier shared by the database and image archives.\n' >&2
  exit 1
fi
if [[ -z "${AGE_IDENTITY:-}" || -L "$AGE_IDENTITY" || ! -f "$AGE_IDENTITY" || ! -r "$AGE_IDENTITY" ]]; then
  printf 'Set AGE_IDENTITY to a readable, regular age identity file on this trusted verification machine.\n' >&2
  exit 1
fi
command -v stat >/dev/null || { printf 'stat is required to inspect age identity permissions.\n' >&2; exit 1; }
identity_mode="$(stat -c '%a' -- "$AGE_IDENTITY")" || {
  printf 'Could not inspect age identity permissions.\n' >&2
  exit 1
}
if [[ "$identity_mode" != "600" && "$identity_mode" != "400" ]]; then
  printf 'Restrict AGE_IDENTITY permissions to 600 or read-only 400 before verifying backups.\n' >&2
  exit 1
fi
command -v age >/dev/null || { printf 'age is required to verify encrypted backups.\n' >&2; exit 1; }
command -v pg_restore >/dev/null || { printf 'pg_restore is required to verify the database archive.\n' >&2; exit 1; }
command -v tar >/dev/null || { printf 'tar is required to verify the image archive.\n' >&2; exit 1; }

backup_dir="$1"
database_archive="$backup_dir/janankadeh_${BACKUP_SET_ID}.dump.age"
images_archive="$backup_dir/product-images_${BACKUP_SET_ID}.tar.gz.age"
for archive in "$database_archive" "$images_archive"; do
  if [[ ! -f "$archive" || ! -s "$archive" ]]; then
    printf 'Required backup archive is missing or empty: %s\n' "$archive" >&2
    exit 1
  fi
done

age --decrypt --identity "$AGE_IDENTITY" "$database_archive" \
  | pg_restore --list > /dev/null
age --decrypt --identity "$AGE_IDENTITY" "$images_archive" \
  | tar -tzf - > /dev/null

printf 'Both encrypted archives for backup set %s decrypted and passed catalog checks.\n' "$BACKUP_SET_ID"
