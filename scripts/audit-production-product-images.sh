#!/usr/bin/env bash
set -Eeuo pipefail

project_dir="$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd -P)"
source "$project_dir/scripts/backup-destination.sh"
env_file="$project_dir/.env.production"
require_protected_production_env_file "$env_file"
for command_name in docker awk sort comm wc head mktemp tr; do
  if ! command -v "$command_name" >/dev/null; then
    printf '%s is required for the read-only product image audit.\n' "$command_name" >&2
    exit 1
  fi
done

compose() {
  docker compose \
    --project-directory "$project_dir" \
    --file "$project_dir/compose.yaml" \
    --project-name janankadeh \
    --env-file "$env_file" \
    "$@"
}

declare -A service_ids=()
for service in database web; do
  if ! service_id="$(compose ps --status running --quiet "$service")"; then
    printf 'Could not inspect Docker Compose service status.\n' >&2
    exit 1
  fi
  if [[ -z "$service_id" ]]; then
    printf 'The %s service must be running to audit product image storage.\n' "$service" >&2
    exit 1
  fi
  if [[ "$service_id" == *$'\n'* ]]; then
    printf 'Expected one running %s container for this read-only audit.\n' "$service" >&2
    exit 1
  fi
  service_ids[$service]="$service_id"
done

if ! image_mount="$(docker inspect \
  --format '{{range .Mounts}}{{if eq .Destination "/app/product-uploads"}}{{.Type}}|{{.Name}}|{{.RW}}{{end}}{{end}}' \
  "${service_ids[web]}" 2>/dev/null)"; then
  printf 'Could not inspect the running web container mounts.\n' >&2
  exit 1
fi
if [[ "$image_mount" != 'volume|janankadeh_product-images|true' ]]; then
  printf 'The web container is not using the expected writable persistent image volume at /app/product-uploads.\n' >&2
  exit 1
fi

umask 077
temporary_directory="$(mktemp -d /tmp/janankadeh-image-audit.XXXXXXXX)"
trap 'rm -rf -- "$temporary_directory"' EXIT

compose exec -T database sh -lc \
  'PGPASSWORD="$APP_DB_PASSWORD" exec psql --no-psqlrc --quiet --set=ON_ERROR_STOP=1 --host=127.0.0.1 --username=janan_app --dbname=janankadeh --tuples-only --no-align' \
  > "$temporary_directory/database-output" <<'SQL'
WITH image_rows AS (
  SELECT "id", "url", "storageReady", "storageDeleting"
  FROM "ProductImage"
  WHERE "url" LIKE '/api/product-images/%'
),
summary AS (
  SELECT
    COUNT(*) FILTER (WHERE NOT "storageReady" AND NOT "storageDeleting") AS pending,
    COUNT(*) FILTER (WHERE "storageDeleting") AS deleting,
    COUNT(*) FILTER (
      WHERE "id" !~* '^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
        OR "url" <> ('/api/product-images/' || "id")
    ) AS invalid
  FROM image_rows
)
SELECT 'STATUS|' || "pending"::text || '|' || "deleting"::text || '|' || "invalid"::text
FROM summary
UNION ALL
SELECT 'REF|' || "id"
FROM image_rows
WHERE "id" ~* '^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
  AND "url" = ('/api/product-images/' || "id")
UNION ALL
SELECT 'READY|' || "id"
FROM image_rows
WHERE "id" ~* '^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
  AND "url" = ('/api/product-images/' || "id")
  AND "storageReady"
  AND NOT "storageDeleting";
SQL

compose exec -T web node -e '
const fs = require("node:fs");
const directory = process.env.PRODUCT_IMAGE_DIR || "/app/product-uploads";
let unclassified = 0;
const handle = fs.opendirSync(directory);
try {
  let entry;
  while ((entry = handle.readSync()) !== null) {
    if (entry.isFile() && /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\.webp$/i.test(entry.name)) {
      console.log("ID\t" + entry.name.slice(0, -5));
    } else {
      unclassified += 1;
    }
  }
} finally {
  handle.closeSync();
}
console.log("OTHER\t" + unclassified);
' > "$temporary_directory/files-output"

awk -F '|' '$1 == "STATUS" { print $2 "|" $3 "|" $4 }' "$temporary_directory/database-output" > "$temporary_directory/status"
awk -F '|' '$1 == "REF" { print $2 }' "$temporary_directory/database-output" > "$temporary_directory/references"
awk -F '|' '$1 == "READY" { print $2 }' "$temporary_directory/database-output" > "$temporary_directory/ready-references"
awk -F '\t' '$1 == "ID" { print $2 }' "$temporary_directory/files-output" > "$temporary_directory/files"
awk -F '\t' '$1 == "OTHER" { print $2 }' "$temporary_directory/files-output" > "$temporary_directory/other-count"
LC_ALL=C sort -u "$temporary_directory/references" > "$temporary_directory/references.sorted"
LC_ALL=C sort -u "$temporary_directory/ready-references" > "$temporary_directory/ready-references.sorted"
LC_ALL=C sort -u "$temporary_directory/files" > "$temporary_directory/files.sorted"
comm -23 "$temporary_directory/ready-references.sorted" "$temporary_directory/files.sorted" > "$temporary_directory/missing-files"
comm -23 "$temporary_directory/files.sorted" "$temporary_directory/references.sorted" > "$temporary_directory/unreferenced-files"

count_lines() {
  wc -l < "$1" | tr -d '[:space:]'
}

IFS='|' read -r pending_count deleting_count invalid_reference_count < "$temporary_directory/status"
unclassified_count="$(< "$temporary_directory/other-count")"
missing_count="$(count_lines "$temporary_directory/missing-files")"
unreferenced_count="$(count_lines "$temporary_directory/unreferenced-files")"

printf 'Read-only product image storage audit (project janankadeh)\n'
printf 'Valid managed database references: %s\n' "$(count_lines "$temporary_directory/references.sorted")"
printf 'UUID WebP files: %s\n' "$(count_lines "$temporary_directory/files.sorted")"
printf 'Ready records missing files: %s\n' "$missing_count"
printf 'Files without a database reference: %s\n' "$unreferenced_count"
printf 'Pending upload reservations: %s\n' "$pending_count"
printf 'Rows marked for deletion: %s\n' "$deleting_count"
printf 'Invalid managed URL or image ID rows: %s\n' "$invalid_reference_count"
printf 'Unclassified volume entries: %s\n' "$unclassified_count"

if (( missing_count > 0 )); then
  printf '\nReady image IDs with no file (first 50):\n'
  head -n 50 "$temporary_directory/missing-files"
fi
if (( unreferenced_count > 0 )); then
  printf '\nFile IDs with no database reference (first 50):\n'
  head -n 50 "$temporary_directory/unreferenced-files"
fi

printf '\nNo database rows or image files were changed. Review every discrepancy before any manual repair or cleanup.\n'
