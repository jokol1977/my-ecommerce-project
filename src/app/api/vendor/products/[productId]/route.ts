import { auth } from "@/auth";
import { getPrisma } from "@/lib/prisma";
import { isSellerSkuConflict, parseProductInput } from "@/lib/product-input";
import { readRequestBody } from "@/lib/request-body";
import { limitVendorCatalogWrites } from "@/lib/vendor-catalog-write-rate-limit";

export const runtime = "nodejs";
const noStore = { "Cache-Control": "no-store" };

export async function PATCH(request: Request, { params }: { params: Promise<{ productId: string }> }) {
  const session = await auth();
  if (!session?.user?.id) return Response.json({ error: "ابتدا وارد حساب شوید." }, { status: 401, headers: noStore });
  if (session.user.status !== "ACTIVE" || session.user.role !== "VENDOR") return Response.json({ error: "دسترسی فروشندهٔ فعال لازم است." }, { status: 403, headers: noStore });
  if (process.env.NODE_ENV === "production" && !process.env.AUTH_URL) return Response.json({ error: "نشانی رسمی سایت پیکربندی نشده است." }, { status: 503, headers: noStore });
  try {
    const origin = request.headers.get("origin");
    if (!origin || new URL(origin).origin !== new URL(process.env.AUTH_URL ?? request.url).origin) return Response.json({ error: "مبدأ درخواست معتبر نیست." }, { status: 403, headers: noStore });
  } catch { return Response.json({ error: "مبدأ درخواست معتبر نیست." }, { status: 403, headers: noStore }); }
  const rateLimitResponse = await limitVendorCatalogWrites(session.user.id, "update");
  if (rateLimitResponse) return rateLimitResponse;
  if (!request.headers.get("content-type")?.toLowerCase().includes("application/json")) return Response.json({ error: "قالب درخواست معتبر نیست." }, { status: 415, headers: noStore });

  let parsed: unknown;
  try {
    const body = await readRequestBody(request, 12_000);
    if (body === null) return Response.json({ error: "درخواست بیش از حد بزرگ است." }, { status: 413, headers: noStore });
    parsed = JSON.parse(body);
  } catch { return Response.json({ error: "اطلاعات فرم معتبر نیست." }, { status: 400, headers: noStore }); }
  const input = parseProductInput(parsed);
  if (!input) return Response.json({ error: "نام، توضیحات، دسته‌بندی، قیمت یا موجودی را بررسی کنید." }, { status: 400, headers: noStore });
  const { productId } = await params;
  if (!/^[a-zA-Z0-9_-]{1,40}$/.test(productId)) return Response.json({ error: "شناسهٔ کالا معتبر نیست." }, { status: 400, headers: noStore });

  try {
    const prisma = getPrisma();
    const vendor = await prisma.vendorProfile.findFirst({ where: { userId: session.user.id, status: "ACTIVE", user: { status: "ACTIVE", role: "VENDOR" } }, select: { id: true } });
    if (!vendor) return Response.json({ error: "فروشگاه فعال پیدا نشد." }, { status: 403, headers: noStore });
    const category = await prisma.category.findFirst({ where: { id: input.categoryId, isActive: true }, select: { id: true } });
    if (!category) return Response.json({ error: "دسته‌بندی فعال پیدا نشد." }, { status: 400, headers: noStore });
    const updated = await prisma.product.updateMany({
      where: { id: productId, vendorId: vendor.id, status: { in: ["REJECTED", "DRAFT"] } },
      data: {
        name: input.name,
        description: input.description,
        brandName: input.brandName,
        productType: input.productType,
        modelCode: input.modelCode,
        sellerSku: input.sellerSku,
        publicProductId: input.publicProductId,
        originCountry: input.originCountry,
        packageLengthMm: input.packageLengthMm,
        packageWidthMm: input.packageWidthMm,
        packageHeightMm: input.packageHeightMm,
        packageWeightGrams: input.packageWeightGrams,
        warrantyDescription: input.warrantyDescription,
        specificationsText: input.specificationsText,
        sourceReference: input.sourceReference,
        sellerContentAttestedAt: new Date(),
        categoryId: category.id,
        priceToman: input.priceToman,
        stockQuantity: input.stockQuantity,
        status: "PENDING_REVIEW",
        reviewNote: null,
      },
    });
    if (updated.count !== 1) return Response.json({ error: "فقط کالای ردشده یا پیش‌نویسِ همین فروشگاه قابل اصلاح است." }, { status: 409, headers: noStore });
    return Response.json({ status: "PENDING_REVIEW" }, { headers: noStore });
  } catch (error) {
    if (isSellerSkuConflict(error)) return Response.json({ error: "کد کالای فروشنده قبلاً در همین فروشگاه استفاده شده است." }, { status: 409, headers: noStore });
    console.error("Vendor product resubmission failed.", error);
    return Response.json({ error: "ارسال دوبارهٔ کالا انجام نشد." }, { status: 503, headers: noStore });
  }
}
