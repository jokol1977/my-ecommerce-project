import "server-only";

export function hasSameOrigin(request: Request): boolean {
  if (process.env.NODE_ENV === "production" && !process.env.AUTH_URL) return false;
  try {
    const origin = request.headers.get("origin");
    const expectedOrigin = new URL(process.env.AUTH_URL ?? request.url).origin;
    return Boolean(origin && new URL(origin).origin === expectedOrigin);
  } catch {
    return false;
  }
}
