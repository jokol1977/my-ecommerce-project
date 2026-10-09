const cronSecret = process.env.CRON_SECRET;
const minimumSecretBytes = 32;
const intervalMs = 60_000;

if (
  !cronSecret ||
  Buffer.byteLength(cronSecret, "utf8") < minimumSecretBytes ||
  cronSecret === "replace_with_a_different_random_secret_of_at_least_32_bytes" ||
  cronSecret.startsWith("replace_with_")
) {
  console.error("Order cleanup scheduler requires a valid CRON_SECRET.");
  process.exit(1);
}

let stopping = false;
let activeController;
let pendingWait;

function stop() {
  stopping = true;
  activeController?.abort();
  if (pendingWait) clearTimeout(pendingWait);
}

process.once("SIGINT", stop);
process.once("SIGTERM", stop);

async function runCleanup() {
  activeController = new AbortController();
  const timeout = setTimeout(() => activeController?.abort(), 25_000);

  try {
    const response = await fetch("http://web:3000/api/cron/expire-orders", {
      method: "POST",
      headers: {
        authorization: "Bearer " + cronSecret,
        accept: "application/json",
      },
      signal: activeController.signal,
    });

    await response.arrayBuffer();
    if (!response.ok) {
      console.error("Order cleanup endpoint returned HTTP " + response.status + ".");
    }
  } catch {
    if (!stopping) console.error("Order cleanup request failed; it will be retried.");
  } finally {
    clearTimeout(timeout);
    activeController = undefined;
  }
}

while (!stopping) {
  const startedAt = Date.now();
  await runCleanup();

  if (!stopping) {
    const delay = Math.max(0, intervalMs - (Date.now() - startedAt));
    await new Promise((resolve) => {
      pendingWait = setTimeout(resolve, delay);
    });
    pendingWait = undefined;
  }
}
