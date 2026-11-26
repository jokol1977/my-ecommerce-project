import "server-only";

export const AUTH_NO_STORE_HEADERS = {
  "Cache-Control": "no-store, max-age=0",
  Pragma: "no-cache",
  Vary: "Origin",
};

export function authJson(body: unknown, status = 200, extraHeaders?: HeadersInit): Response {
  return Response.json(body, {
    status,
    headers: { ...AUTH_NO_STORE_HEADERS, ...Object.fromEntries(new Headers(extraHeaders)) },
  });
}

export function isSameOriginAuthRequest(request: Request): boolean {
  const suppliedOrigin = request.headers.get("origin");
  if (!suppliedOrigin) return false;

  try {
    const configuredUrl = process.env.AUTH_URL;
    const expectedOrigin = configuredUrl
      ? new URL(configuredUrl).origin
      : new URL(request.url).origin;
    const parsedOrigin = new URL(suppliedOrigin);
    return parsedOrigin.origin === suppliedOrigin && parsedOrigin.origin === expectedOrigin;
  } catch {
    return false;
  }
}

/** Read a small JSON request without buffering an unbounded attacker body. */
export async function readSmallJson(request: Request, maximumBytes = 2_048): Promise<unknown | null> {
  const contentType = request.headers.get("content-type")?.split(";", 1)[0]?.trim().toLowerCase();
  if (contentType !== "application/json") return null;

  const declaredLength = request.headers.get("content-length");
  if (declaredLength && (!/^\d+$/.test(declaredLength) || Number(declaredLength) > maximumBytes)) return null;

  if (!request.body) return null;
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let totalBytes = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      totalBytes += value.byteLength;
      if (totalBytes > maximumBytes) {
        await reader.cancel();
        return null;
      }
      chunks.push(value);
    }
  } catch {
    return null;
  }

  try {
    const bytes = new Uint8Array(totalBytes);
    let offset = 0;
    for (const chunk of chunks) {
      bytes.set(chunk, offset);
      offset += chunk.byteLength;
    }
    return JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes));
  } catch {
    return null;
  }
}
