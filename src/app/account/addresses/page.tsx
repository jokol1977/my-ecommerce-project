import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { getPrisma } from "@/lib/prisma";
import AddressManager from "./address-manager";

export const metadata: Metadata = { title: "نشانی‌های من | جانان‌کده" };

export default async function AddressesPage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");
  if (session.user.status !== "ACTIVE") redirect("/account");
  const addresses = await getPrisma().address.findMany({
    where: { userId: session.user.id }, orderBy: { createdAt: "desc" }, take: 20,
    select: { id: true, title: true, recipient: true, phone: true, province: true, city: true, addressLine: true, postalCode: true },
  });
  return <main dir="rtl" className="min-h-screen bg-slate-50 px-4 py-10"><div className="mx-auto max-w-4xl">
    <Link href="/account" className="text-sm font-bold text-blue-700 hover:underline">بازگشت به حساب کاربری</Link>
    <h1 className="mt-4 text-2xl font-black text-slate-900">دفترچهٔ نشانی‌ها</h1>
    <p className="mt-2 text-sm leading-7 text-slate-600">نشانی‌ها فقط برای همین حساب قابل مشاهده‌اند و هنگام ثبت سفارش می‌توانید از آن‌ها استفاده کنید.</p>
    <AddressManager addresses={addresses} />
  </div></main>;
}
