import "server-only";
import { auth } from "@/auth";
import { redirect } from "next/navigation";

/** Enforce the active administrator gate on every protected server-rendered admin page. */
export async function requireActiveAdmin(): Promise<void> {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");
  if (session.user.status !== "ACTIVE" || session.user.role !== "ADMIN") redirect("/account");
}
