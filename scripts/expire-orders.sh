#!/bin/sh
set -eu

project_dir="$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)"

docker compose --env-file "$project_dir/.env.production" exec -T web node -e '
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
