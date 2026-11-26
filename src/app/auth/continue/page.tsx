import { auth } from "@/auth";
import { isAdminMfaSetupActive } from "@/lib/auth/session";
import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

export default async function ContinueAfterLoginPage() {
  const session = await auth();
  if (!session?.user?.id || session.user.status !== "ACTIVE") redirect("/login");

  if (session.user.role === "ADMIN") {
    if (session.user.mfaVerified) redirect("/admin");
    if (
      session.user.adminMfaSetup &&
      isAdminMfaSetupActive(session.user.adminMfaSetupExpiresAt)
    ) redirect("/admin/mfa/setup");
    redirect("/login");
  }

  redirect("/account");
}
