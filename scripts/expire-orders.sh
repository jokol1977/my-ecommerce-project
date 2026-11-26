#!/usr/bin/env bash
set -Eeuo pipefail

project_dir="$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd -P)"
source "$project_dir/scripts/backup-destination.sh"
env_file="$project_dir/.env.production"
require_protected_production_env_file "$env_file"

docker compose \
  --project-directory "$project_dir" \
  --file "$project_dir/compose.yaml" \
  --project-name janankadeh \
  --env-file "$env_file" \
  exec -T web node -e '
fetch("http://127.0.0.1:3000/api/cron/expire-orders", {
  method: "POST",
  headers: { authorization: `Bearer ${process.env.CRON_SECRET}` },
}).then(async (response) => {
  const body = await response.text();
  if (!response.ok) throw new Error(`Cleanup endpoint returned ${response.status}: ${body}`);
  process.stdout.write(`${body}\n`);
}).catch(() => {
  console.error("Expired-order cleanup request failed.");
  process.exitCode = 1;
});
'
