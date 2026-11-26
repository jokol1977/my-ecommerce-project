export function isAdminMfaSetupActive(expiresAt: number | null | undefined): boolean {
  return typeof expiresAt === "number" && expiresAt > Date.now();
}
