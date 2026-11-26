#!/usr/bin/env bash

require_protected_production_env_file() {
  local env_file="$1"
  local mode

  if [[ -L "$env_file" || ! -f "$env_file" || ! -r "$env_file" ]]; then
    printf 'Production Compose environment must be a readable regular file, not a symbolic link.\n' >&2
    return 1
  fi
  if ! command -v stat >/dev/null; then
    printf 'stat is required to inspect production environment file permissions.\n' >&2
    return 1
  fi
  if ! mode="$(stat -c '%a' -- "$env_file" 2>/dev/null)"; then
    printf 'Could not inspect production environment file permissions.\n' >&2
    return 1
  fi
  if [[ "$mode" != "600" && "$mode" != "400" ]]; then
    printf 'Restrict .env.production permissions to 600 (or read-only 400) before creating production backups.\n' >&2
    return 1
  fi
  return 0
}

require_independent_backup_directory() {
  local project_dir="$1"
  local configured_dir="${JANANKADEH_BACKUP_DIR:-}"
  local resolved_project_dir resolved_backup_dir project_device backup_device

  if [[ -z "$configured_dir" ]]; then
    printf 'Set JANANKADEH_BACKUP_DIR to a pre-mounted backup destination.\n' >&2
    return 1
  fi
  if [[ ! -d "$configured_dir" ]]; then
    printf 'Backup destination must already exist as a directory or mounted path: %s\n' "$configured_dir" >&2
    return 1
  fi
  for command_name in realpath stat; do
    if ! command -v "$command_name" >/dev/null; then
      printf '%s is required to validate the backup destination.\n' "$command_name" >&2
      return 1
    fi
  done

  resolved_project_dir="$(realpath -e -- "$project_dir")" || return 1
  resolved_backup_dir="$(realpath -e -- "$configured_dir")" || return 1
  case "$resolved_backup_dir" in
    "$resolved_project_dir"|"$resolved_project_dir"/*)
      printf 'Backup destination must be outside the project directory.\n' >&2
      return 1
      ;;
  esac

  project_device="$(stat -c '%d' -- "$resolved_project_dir")" || return 1
  backup_device="$(stat -c '%d' -- "$resolved_backup_dir")" || return 1
  if [[ "$project_device" == "$backup_device" ]]; then
    printf 'Backup destination must be on a different filesystem from the project; refusing same-disk backup at %s.\n' "$resolved_backup_dir" >&2
    return 1
  fi
  if [[ ! -w "$resolved_backup_dir" ]]; then
    printf 'Backup destination is not writable: %s\n' "$resolved_backup_dir" >&2
    return 1
  fi

  printf '%s\n' "$resolved_backup_dir"
}
