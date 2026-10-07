import { getRuntimeReadiness } from "@/lib/runtime-health";

export const runtime = "nodejs";

const headers = {
  "Cache-Control": "no-store",
  "Referrer-Policy": "no-referrer",
};

export async function GET() {
  const readiness = await getRuntimeReadiness();
  const ready = readiness.database && readiness.rateLimitStore && readiness.rateLimitConfiguration;
  return Response.json({ status: ready ? "ready" : "unavailable" }, {
    status: ready ? 200 : 503,
    headers,
  });
}
