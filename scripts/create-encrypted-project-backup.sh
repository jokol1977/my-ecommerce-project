#!/usr/bin/env bash
set -Eeuo pipefail
umask 077

project_root='/mnt/d/my-ecommerce-project'
backup_dir="$project_root/backups"

if [[ ! -d "$project_root" ]]; then
  printf 'Project directory not found: %s\n' "$project_root" >&2
  exit 1
fi

if ! command -v age >/dev/null 2>&1; then
  printf 'age is not installed in WSL. No archive was created.\n' >&2
  exit 1
fi

if ! command -v tar >/dev/null 2>&1; then
  printf 'GNU tar is not installed in WSL. No archive was created.\n' >&2
  exit 1
fi

mkdir -p -- "$backup_dir"
stamp=$(date '+%Y%m%d-%H%M%S')
archive_name="janankadeh-project-$stamp.tar.gz.age"
archive_path="$backup_dir/$archive_name"
partial_path="$archive_path.partial"

if [[ -e "$archive_path" || -e "$partial_path" ]]; then
  printf 'Target already exists; refusing to overwrite it: %s\n' "$archive_path" >&2
  exit 1
fi

cleanup() {
  rm -f -- "$partial_path"
}
trap cleanup EXIT

printf 'Project: %s\n' "$project_root"
printf 'Encrypted output: %s\n' "$archive_path"
printf 'Included: project files, Git data, local configuration files, and backups other than prior encrypted project archives.\n'
printf 'Excluded: node_modules, .next build/dependency caches, and prior encrypted project archives to avoid nesting them.\n'
printf 'The archive stays on this computer and is encrypted with a passphrase you enter below.\n\n'

tar -C "$project_root" \
  --exclude='./node_modules' \
  --exclude='./.next' \
  --exclude='./backups/janankadeh-project-*.tar.gz.age*' \
  -czf - . \
  | age --passphrase --output "$partial_path"

if [[ ! -s "$partial_path" ]]; then
  printf 'Encrypted output is empty; no final archive was kept.\n' >&2
  exit 1
fi

printf '\nChecking the encrypted archive. Enter the same passphrase once more.\n'
age --decrypt "$partial_path" | tar -tzf - >/dev/null

mv -- "$partial_path" "$archive_path"
trap - EXIT

printf '\nEncrypted project backup created and its archive listing was verified:\n'
stat -c '%s bytes | %n' "$archive_path"
sha256sum "$archive_path"
