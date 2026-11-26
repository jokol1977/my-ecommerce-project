import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { auth } from "@/auth";
import { getPrisma } from "@/lib/prisma";
import { SUPPORT_CASE_CATEGORY_LABELS, SUPPORT_CASE_STATUS_LABELS } from "@/lib/support-case-labels";
import SupportCaseThread from "./thread";

export const metadata: Metadata = { title: "گفتگوی پشتیبانی | جانان‌کده" };

type SupportCasePageProps = { params: Promise<{ caseId: string }> };

export default async function SupportCasePage({ params }: SupportCasePageProps) {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");
  if (session.user.status !== "ACTIVE") redirect("/account");
  if (session.user.role !== "CUSTOMER" && session.user.role !== "VENDOR" && session.user.role !== "ADMIN") redirect("/account");

  const { caseId } = await params;
  if (!/^[a-zA-Z0-9_-]{1,40}$/.test(caseId)) notFound();

  let vendorId: string | undefined;
  if (session.user.role === "VENDOR") {
    const vendor = await getPrisma().vendorProfile.findFirst({
      where: { userId: session.user.id, status: "ACTIVE", user: { role: "VENDOR", status: "ACTIVE" } },
      select: { id: true },
    });
    if (!vendor) redirect("/seller/apply");
    vendorId = vendor.id;
  }

  const supportCase = await getPrisma().supportCase.findFirst({
    where: {
      id: caseId,
      ...(session.user.role === "CUSTOMER" ? { customerId: session.user.id } : {}),
      ...(vendorId ? { vendorOrder: { vendorId } } : {}),
    },
    select: {
      id: true,
      category: true,
      status: true,
      createdAt: true,
      vendorOrder: {
        select: {
          order: { select: { id: true } },
          vendor: { select: { storeName: true } },
        },
      },
      messages: {
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        take: 101,
        select: { id: true, authorRole: true, body: true, createdAt: true },
      },
    },
  });
  if (!supportCase) notFound();

  const messagesNewestFirst = supportCase.messages.slice(0, 100);
  const messages = messagesNewestFirst.reverse().map((message) => ({
    id: message.id,
    authorRole: message.authorRole,
    body: message.body,
    createdAtLabel: new Intl.DateTimeFormat("fa-IR-u-ca-persian", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Tehran" }).format(message.createdAt),
  }));
  const backHref = session.user.role === "ADMIN" ? "/admin/support" : session.user.role === "VENDOR" ? "/seller/support" : "/account/support";
  const backLabel = session.user.role === "ADMIN" ? "بازگشت به درخواست‌های پشتیبانی" : session.user.role === "VENDOR" ? "بازگشت به پرونده‌های فروشگاه" : "بازگشت به درخواست‌های من";
  const viewerRole = session.user.role;

  return (
    <main dir="rtl" className="min-h-screen bg-slate-50 px-4 py-10">
      <div className="mx-auto max-w-3xl">
        <Link href={backHref} className="text-sm font-bold text-blue-700 hover:underline">{backLabel}</Link>
        <header className="mt-5 rounded-2xl border border-slate-100 bg-white p-5 shadow-sm sm:p-7">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className="text-sm font-bold text-blue-800">{SUPPORT_CASE_STATUS_LABELS[supportCase.status]}</p>
              <h1 className="mt-2 text-2xl font-black text-slate-900">{SUPPORT_CASE_CATEGORY_LABELS[supportCase.category]}</h1>
              <p className="mt-2 text-sm leading-6 text-slate-600">فروشگاه {supportCase.vendorOrder.vendor.storeName} · سفارش <span dir="ltr" className="inline-block font-mono">{supportCase.vendorOrder.order.id}</span></p>
            </div>
            <time className="text-xs text-slate-500">ثبت: {new Intl.DateTimeFormat("fa-IR-u-ca-persian", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Tehran" }).format(supportCase.createdAt)}</time>
          </div>
        </header>
        <SupportCaseThread
          caseId={supportCase.id}
          viewerRole={viewerRole}
          status={supportCase.status}
          messages={messages}
          hasOlderMessages={supportCase.messages.length > 100}
        />
      </div>
    </main>
  );
}
