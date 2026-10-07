import "server-only";
import { getPrisma } from "@/lib/prisma";
import { hasUsableRateLimitConfiguration, isRateLimitStoreHealthy } from "@/lib/rate-limit";

export async function getRuntimeReadiness() {
  const databaseCheck = Promise.resolve()
    .then(() => getPrisma().$queryRawUnsafe<unknown[]>("SELECT 1 AS ready"))
    .then((result) => Array.isArray(result) && result.length === 1);
  const rateLimitStoreCheck = isRateLimitStoreHealthy();
  const [database, rateLimitStore] = await Promise.allSettled([databaseCheck, rateLimitStoreCheck]);

  return {
    database: database.status === "fulfilled" && database.value,
    rateLimitStore: rateLimitStore.status === "fulfilled" && rateLimitStore.value,
    rateLimitConfiguration: hasUsableRateLimitConfiguration(),
  };
}
