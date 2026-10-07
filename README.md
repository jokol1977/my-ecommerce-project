# جانان‌کده

پروژه بازارگاه فارسی با Next.js، TypeScript، PostgreSQL و Prisma. مسیر فعلی ابتدا فروشگاه و گردش سفارش را می‌سازد؛ امکانات بازارگاه چندفروشنده‌ای روی همین هسته اضافه می‌شوند.

## راه‌اندازی پایگاه داده محلی در ویندوز

این پروژه از PostgreSQL بومی ویندوز پشتیبانی می‌کند و برای روش زیر به Docker نیاز ندارد. اسکریپت راه‌اندازی فعلی برای PostgreSQL 18 در مسیر پیش‌فرض نصب ویندوز نوشته شده است. اگر پایگاه دادهٔ `janankadeh` و نقش‌های پروژه قبلاً ساخته شده‌اند، مرحلهٔ ساخت پایگاه داده را رد کنید.

1. فقط اگر فایل `.env` ندارید، یک نسخهٔ محلی از نمونه تنظیمات بسازید:

   ```powershell
   Copy-Item .env.example .env
   ```

2. در فایل `.env`، رمزهای مدیر، برنامه و مهاجرت را تنظیم کنید. رمز برنامه در `DATABASE_URL` باید با `APP_DB_PASSWORD` و رمز مهاجرت در `DIRECT_URL` باید با `MIGRATOR_DB_PASSWORD` یکسان باشد. این تنظیمات فقط برای توسعهٔ محلی‌اند.

3. PostgreSQL را از Services ویندوز اجرا کنید و فقط برای ساخت اولیهٔ پایگاه داده و نقش‌ها، اسکریپت زیر را اجرا کنید. رمز مدیر PostgreSQL به‌صورت مخفی از شما پرسیده می‌شود و ذخیره نمی‌شود:

   ```powershell
   .\scripts\setup-local-postgres.ps1
   ```

   برنامه با کاربر محدود `janan_app` وصل می‌شود؛ مهاجرت‌ها با کاربر جداگانهٔ `janan_migrator` اجرا می‌شوند و اتصال مدیر پایگاه داده در برنامه نیست.

4. مدل Prisma را بررسی و کلاینت را تولید کنید:

   ```powershell
   npm run db:validate
   npm run db:generate
   ```

5. مهاجرت‌های ثبت‌شدهٔ پروژه را اعمال کنید:

   ```powershell
   npm run db:deploy
   ```

6. برنامه را اجرا کنید:

   ```powershell
   npm run dev
   ```

`npm run db:studio` پنل محلی مشاهدهٔ داده‌ها را باز می‌کند. پیش از هر مهاجرت مهم، از داده‌ها پشتیبان بگیرید. فایل `.env` و کلیدهای واقعی نباید وارد Git شوند. در محیط انتشار نیز برای برنامه و اجرای مهاجرت‌ها رمزهای جداگانه و دسترسی محدود نگه دارید.

## Local PostgreSQL backup

With the native PostgreSQL 18 service running, create and verify a compressed database backup with:

```powershell
.\scripts\backup-local-db.ps1
```

The script uses the restricted `janan_app` database account and reads its password from the ignored `.env` file without printing it. Backups are written to the ignored `backups` directory inside the project by default; set `-DestinationDirectory` to choose another location. The script checks that PostgreSQL can read the backup archive catalog. Backups may contain private customer and order data: limit access, encrypt copies stored elsewhere, and test restoration before relying on a backup. This script is for the local database; production backups must be configured with the hosting provider and tested independently.

To test an actual restore without changing `janankadeh`, run:

```powershell
.\scripts\test-local-db-restore.ps1
```

The script restores the latest local archive into a uniquely named temporary database using `janan_migrator`, checks the presence of the Prisma migration metadata table and core application tables, and reports whether the current ledger table is included. It then removes only that temporary database. The script reads `MIGRATOR_DB_PASSWORD` from `.env` without printing it. If restoration fails, the source database and archive remain unchanged; if cleanup fails, the script reports the temporary database name for manual cleanup.

## بررسی سلامت راه‌اندازی محلی

برای بررسی تنظیمات بدون نمایش رمزها، اجرای PostgreSQL، اتصال با نقش محدود برنامه، وضعیت مهاجرت‌های Prisma، خوانا بودن آخرین آرشیو پشتیبان و نادیده‌گرفته‌شدن `.env` و `backups` توسط Git، اجرا کنید:

```powershell
.\scripts\check-local-readiness.ps1
```

این بررسی فقط وضعیت محلی را می‌خواند و دیتابیس را تغییر نمی‌دهد. موفقیت آن به معنی آماده‌بودن سایت برای انتشار نیست. پرداخت تولیدی علاوه بر حالت `production`، شناسهٔ پذیرندهٔ معتبر و `AUTH_URL` رسمی HTTPS، به فعال‌سازی صریح `MARKETPLACE_LIVE_CHECKOUT_ENABLED=true` پس از تکمیل فرآیندهای حقوقی، مالی و بازپرداخت نیاز دارد؛ تنظیم این مقادیر جای آزمون عملی درگاه را نمی‌گیرد.

## مدل فعلی

- حساب‌ها و نقش‌های مشتری، فروشنده و مدیر
- پروفایل فروشنده با وضعیت تأیید
- ساخت و نمایش مسیر درختی دسته‌بندی‌ها؛ والد باید فعال باشد و زیرشاخه‌ها پیش از والد غیرفعال می‌شوند
- صفحه عمومی فروشگاه برای فروشندگان فعال و نمایش کالاهای تأییدشده با صفحه‌بندی
- نمای صفحه‌بندی‌شدهٔ سفارش‌ها برای مدیر، همراه با وضعیت زیرسفارش فروشندگان و بدون نمایش اطلاعات نشانی مشتری
- صف بررسی کالاهای مدیر با صفحه‌بندی و دسترسی به بیش از ۱۰۰ کالای در انتظار بررسی
- صفحه‌بندی صف درخواست‌های فروشندگی و دیدگاه‌های در انتظار بررسی مدیر
- سایت‌مپ پویا برای صفحهٔ اصلی و حداکثر ۴۹٬۹۹۹ کالای عمومی، و robots.txt برای راهنمایی خزنده‌های موتور جست‌وجو
- دسته‌بندی درختی و محصول دارای مالک فروشنده، قیمت تومانی، موجودی و وضعیت انتشار
- جست‌وجوی سروری در نام کالا، توضیحات و نام فروشگاه، فیلتر دسته‌بندی یکتا بر اساس شناسه (با احتساب همهٔ زیرشاخه‌های فعال)، بازهٔ قیمت و موجودی، و مرتب‌سازی پایدار بر اساس تازه‌ترین/ارزان‌ترین/گران‌ترین
- سفارش مشتری با تصویر ثابت نشانی و مبلغ زمان ثبت
- لغو سفارش پرداخت‌نشده توسط خریدار و آزادسازی اتمیک موجودی رزروشده
- زیرفاکتور جدا برای هر فروشنده در سفارش چندفروشنده‌ای
- دیدگاه و امتیاز فقط از خریدار دارای سفارش تحویل‌شده؛ انتشار پس از تأیید مدیر و نمایش میانگین در کارت کالا
- ثبت صفحه‌بندی‌شدهٔ رویدادهای مهم مدیران؛ رویدادها در تراکنش همان تغییر ذخیره می‌شوند و در پایگاه داده ویرایش یا حذف آن‌ها مسدود است
- تأیید دریافت هر زیرفاکتور ارسال‌شده توسط خریدار در جزئیات سفارش
- ثبت پروندهٔ پشتیبانی برای زیرسفارش، گفتگوی مشترک خریدار/فروشگاه/مدیر و ثبت ممیزی تغییر وضعیت مدیریتی
- ثبت وضعیت پرداخت و شناسه درگاه، بدون نگهداری اطلاعات کارت بانکی
- درخواست و تأیید سروری پرداخت زرین‌پال با جلوگیری از تکرار تلاش فعال و نمایش سفارش‌های نیازمند بررسی مدیر

اطلاعات کاتالوگ فعلی در `src/data/demo-catalog.ts` فقط برای نمایش است و مرجع قیمت، موجودی یا سفارش واقعی نیست.

## Email sign-in configuration

## Content security policy

Production responses use a restrictive `script-src 'self'` policy with Next.js subresource integrity (`sha256`) enabled. The SRI option is experimental in the installed Next.js version, so recheck this behavior when upgrading Next.js. Development allows inline/eval scripts for the development runtime. Style attributes remain allowed for image layout, while modern browsers restrict inline `<style>` elements to same-origin sources; the base `style-src` directive preserves compatibility with browsers that do not support the more specific style directives. Keep user-controlled content out of style values.

## معماری انتشار تولیدی

معماری انتشار بر سرور لینوکسی داخل ایران است: برنامهٔ Next.js، PostgreSQL و Redis با Docker Compose اجرا می‌شوند و Nginx روی میزبان، HTTPS و پراکسی ورودی را فراهم می‌کند. Vercel و Neon برای اجرای این ساختار لازم نیستند. استفاده از سرویس‌های داخلی، هزینهٔ خود سرور، دامنه، گواهی یا ارائه‌دهنده را حذف نمی‌کند.

Compose آمادگی سرویس برنامه را از مسیر بررسی داخلی می‌سنجد: اتصال پایگاه داده و Redis باید برقرار باشد تا کانتینر سالم گزارش شود. پاسخ این مسیر فقط وضعیت کلی را می‌دهد و جزئیات خطا یا رمزها را نمایش نمی‌دهد.

### راه‌اندازی روی سرور لینوکس

1. کد پروژه را روی سرور قرار دهید و فایل تولید را بسازید:

   ```bash
   cp .env.production.example .env.production
   chmod 600 .env.production
   ```

2. در `.env.production` همهٔ رمزهای نمونه را با رمزهای یکتای URL-safe عوض کنید. مقدار رمز در `DATABASE_URL` باید دقیقاً با `APP_DB_PASSWORD` و مقدار رمز در `DIRECT_URL` باید با `MIGRATOR_DB_PASSWORD` یکی باشد. `REDIS_URL` نیز باید از همان رمز `REDIS_PASSWORD` استفاده کند. برای `AUTH_SECRET`، `RATE_LIMIT_SECRET` و `CRON_SECRET` سه مقدار تصادفیِ جداگانه بسازید. نشانی `AUTH_URL` باید دامنهٔ اصلی با HTTPS باشد.

3. نشانی‌های ایمیل را به SMTP متعلق به ارائه‌دهندهٔ داخل ایران یا سرور ایمیل خودتان وصل کنید. پورت ۵۸۷ با STARTTLS و پورت ۴۶۵ با TLS مستقیم پشتیبانی می‌شود. ورود ایمیلی تا زمانی که تنظیم SMTP معتبر نباشد در حالت آماده‌سازی می‌ماند.

4. فایل Compose را بررسی و تصویرها را بسازید:

   ```bash
   docker compose --env-file .env.production config --quiet
   docker compose --profile ops --env-file .env.production build web migrate
   ```

5. پایگاه داده و نقش‌های محدود آن را بالا بیاورید، مهاجرت‌ها را اجرا کنید و سپس برنامه را راه‌اندازی کنید:

   ```bash
   docker compose --env-file .env.production up -d database redis
   docker compose --profile ops --env-file .env.production run --rm migrate
   docker compose --env-file .env.production up -d web
   docker compose --env-file .env.production ps
   ```

   سرویس برنامه فقط با نقش محدود `janan_app` کار می‌کند؛ سرویس یک‌بارهٔ `migrate` از نقش جداگانهٔ `janan_migrator` استفاده می‌کند. رمز مدیر پایگاه داده به برنامه داده نمی‌شود. PostgreSQL و Redis پورت عمومی ندارند و پورت برنامه فقط روی `127.0.0.1` میزبان باز می‌شود. داده‌ها در volumeهای Docker نگهداری می‌شوند. اسکریپت ساخت نقش‌ها فقط هنگام ایجاد volume خالی اجرا می‌شود؛ برای حفظ داده‌ها `docker compose down -v` نزنید.

6. Nginx و گواهی HTTPS را طبق [راهنمای مرحله‌به‌مرحلهٔ نصب Nginx و HTTPS](docs/https-setup-fa.md) روی VPS آماده کنید. نمونه، هدر `X-Real-IP` را از اتصال واقعی Nginx می‌سازد و مقدار ارسالی کاربر را جایگزین می‌کند؛ برنامه فقط همین هدر را از پراکسی مورداعتماد می‌پذیرد. `X-Forwarded-For` مبنای شناسایی IP نیست. لاگ نمونهٔ Nginx نه query string و نه هدر Referer را ثبت می‌کند تا توکن ورود ایمیلی در access log ثبت نشود.

برای استفاده از Cloudflare، در شروع DNS-only ساده‌ترین مسیر است. اگر پراکسی Cloudflare را روشن می‌کنید، پیش از آن Nginx باید فقط رنج‌های IP رسمی Cloudflare را به‌عنوان پراکسی مورداعتماد بشناسد و IP کاربر را از هدر رسمی Cloudflare بازسازی کند؛ در غیر این صورت محدودسازی برنامه IP سرور Cloudflare را خواهد دید. هرگز هدر IP را از همهٔ فرستنده‌ها قابل‌اعتماد فرض نکنید. محافظت در برابر حملهٔ حجمی نیز به ظرفیت شبکه و فایروال ارائه‌دهندهٔ سرور نیاز دارد.

برای آزادشدن خودکار موجودی رزروشدهٔ سفارش‌های منقضی، روی میزبان `chmod 700 scripts/expire-orders.sh scripts/backup-production-db.sh` را اجرا کنید و این نمونه‌ها را با مسیر واقعی پروژه در `crontab -e` کاربر سرویس قرار دهید:

```cron
* * * * * /opt/janankadeh/scripts/expire-orders.sh
30 2 * * * /opt/janankadeh/scripts/backup-production-db.sh
```

اسکریپت انقضای سفارش کلید زمان‌بندی را از محیط کانتینر می‌خواند؛ آن را در خط cron یا لاگ قرار ندهید. پیش از مهاجرت نسخهٔ جدید هم پشتیبان بگیرید. اسکریپت پشتیبان‌گیری آرشیو را در `backups/production` می‌سازد و فقط ساختار آرشیو را بررسی می‌کند؛ فایل خروجی را رمزگذاری و به محل دیگری منتقل کنید.

### سرویس‌های داخلی و داده‌های ایران

- محدودسازی درخواست‌ها در سطح برنامه از Redis و شمارندهٔ اتمیک استفاده می‌کند. محدودیت مسیر عمومی `POST /api/cart/quote` برابر ۶۰ درخواست در دقیقه برای هر IP است؛ Redis در تولید لازم است و در صورت از دسترس خارج‌شدن آن درخواست رد می‌شود. تشخیص IP تولید فقط وقتی معتبر است که برنامه پشت Nginx تعریف‌شده باشد.
- مسیر عمومی فهرست کالا `GET /api/products` نیز به ۳۰۰ درخواست در دقیقه برای هر IP محدود است. در تولید، خرابی یا پیکربندی‌نبودن Redis باعث پاسخ موقت `503` می‌شود؛ عبور از سقف، پاسخ `429` همراه `Retry-After` می‌دهد. کاربران پشت یک IP مشترک سهمیهٔ مشترک دارند و پس از راه‌اندازی باید این عدد بر اساس ترافیک واقعی بازبینی شود.
- مسیر بررسی آمادگی `/api/health/ready` فقط برای بررسی داخلی Docker نگه داشته شده است. پیکربندی نمونهٔ Nginx درخواست عمومی این مسیر را با `404` پاسخ می‌دهد و وضعیت پایگاه داده و Redis را در دسترس بازدیدکنندگان قرار نمی‌دهد.
- ثبت نشانی و سفارش شمارهٔ همراه را به شکل `09xxxxxxxxx` یکسان می‌کند و کد پستی را به ۱۰ رقم تبدیل و بررسی می‌کند. تابع اعتبارسنجی checksum کد ملی نیز آماده است؛ چون هیچ فرم فعلی کد ملی نمی‌خواهد، این شناسهٔ حساس بدون نیاز تجاری جمع‌آوری یا ذخیره نمی‌شود.
- تاریخ‌های نمایشی از تقویم جلالی و منطقهٔ زمانی تهران استفاده می‌کنند. زمان‌های ذخیره‌شده در پایگاه داده زمان استاندارد هستند و فقط هنگام نمایش به تقویم محلی تبدیل می‌شوند.
- مبلغ محصولات، سفارش و دفتر مالی عدد صحیح تومان است. آداپتور زرین‌پال هنگام فراخوانی درگاه مبلغ را به ریال تبدیل می‌کند و اطلاعات کارت بانکی در این برنامه ذخیره نمی‌شود. شناسهٔ درگاه در مدل پرداخت رشته‌ای است؛ آداپتورهای سامان و ملت هنوز پیاده‌سازی و فعال نشده‌اند و باید جداگانه بر اساس قرارداد و مستندات رسمی هر درگاه ساخته و بررسی شوند. پرداخت زنده و پذیرش فروشنده در تنظیمات نمونه خاموش‌اند.
- احراز هویت با لینک یک‌بارمصرف ایمیلی از SMTP قابل‌تنظیم انجام می‌شود؛ سرویس Resend از مسیر ورود حذف شده است. آداپتور پیامک سمت‌سرور برای کاوه‌نگار آماده است و با `SMS_PROVIDER=kavenegar`، `KAVENEGAR_API_KEY` و `KAVENEGAR_SENDER` تنظیم می‌شود. این آداپتور تا وقتی یک رویداد برنامه آن را فراخوانی نکند پیامکی نمی‌فرستد و هنوز جایگزین ورود ایمیلی نیست.

محدودیت پنج ارسال لینک ورود برای هر ایمیل و بیست ارسال برای هر IP در هر ۱۵ دقیقه در فرم و callback اعمال می‌شود. کلیدهای محدودسازی در Redis نگهداری می‌شوند و شناسهٔ ایمیل و IP پیش از استفاده با HMAC خلاصه می‌شوند. تنظیمات واقعی فقط در `.env.production` بمانند و نسخهٔ رمزگذاری‌شدهٔ پشتیبان پایگاه داده به میزبان دیگری منتقل شود؛ بازیابی نسخهٔ پشتیبان را به‌صورت دوره‌ای تمرین کنید.

## پیامک رویداد سفارش

برای تنظیم محلی، از پوشهٔ پروژه در PowerShell این دستور را اجرا کنید: ./scripts/configure-local-kavenegar.ps1. کلید هنگام ورود پنهان است و فقط در فایل محلیِ نادیده‌گرفته‌شدهٔ .env ذخیره می‌شود؛ این اسکریپت پیام آزمایشی نمی‌فرستد. در سرور، همین سه مقدار را فقط در بخش رمزهای محرمانهٔ میزبان وارد کنید.

اگر `SMS_PROVIDER=kavenegar` و کلید API و شمارهٔ فرستنده در تنظیمات محرمانهٔ میزبان قرار بگیرند، تأیید موفق پرداخت و ارسال هر زیرسفارش فروشنده، اعلان را در همان تراکنش پایگاه داده صف می‌کنند. ارسال واقعی خارج از تراکنش و توسط همان زمان‌بند محافظت‌شدهٔ دقیقه‌ای انجام می‌شود؛ در حالت پیش‌فرض `SMS_PROVIDER=disabled` است و هیچ پیامی ارسال نمی‌شود. صف فقط شناسهٔ رویداد و سفارش را نگه می‌دارد، نه شمارهٔ همراه یا متن پیام. ارسال ناموفق حداکثر سه بار با فاصلهٔ زمانی تلاش می‌شود و موارد قدیمی‌تر از ۲۴ ساعت متوقف می‌شوند. اگر ارائه‌دهنده پیام را پذیرفته باشد ولی پاسخ شبکه گم شود، احتمال دریافت دوبارهٔ همان پیام وجود دارد.

## Customer address book

Each account can save up to 20 addresses. Creating, updating, and deleting addresses share a persistent limit of 30 changes per account in a one-hour window across devices. The API returns `429` with `Retry-After` when the limit is reached, and fails closed if it cannot check the limit.

## Vendor application review

Customer accounts can submit a vendor application at `/seller/apply`. New stores stay hidden until an administrator approves them. The review queue is at `/admin/vendors`; approval promotes the account to the `VENDOR` role in the same database transaction.

There is deliberately no public administrator-registration form. To bootstrap the first local administrator, first sign in with the intended email and confirm that the account is active and verified. Then run this script from the project directory:

```powershell
.\scripts\bootstrap-local-admin.ps1
```

The script asks for the account email and PostgreSQL administrator password without saving the password. It runs only against the local database, permits this bootstrap only when no administrator exists, requires a matching active verified account, and records the initial promotion in the append-only administrator audit log. Never expose database credentials or administrator promotion through a public API. Use your production host's restricted administrative procedure for production; do not run this local script there.

## Admin audit trail

The active administrator can review the paginated activity log at `/admin/audit`. Vendor decisions, product and review moderation, and category creation or activation changes are recorded in the same transaction as the change. The log stores the administrator account, action, target type and target ID; it does not copy addresses, review text, payment data or secrets. A PostgreSQL trigger rejects updates and deletes to audit rows. Database owners can still administer the database, so production access and backups must remain restricted.

## Vendor product review

After a vendor application is approved, the seller can submit products from `/seller`. New products remain in `PENDING_REVIEW` and are not visible in the public catalog until an administrator approves them at `/admin/products`. The product endpoint derives the vendor from the authenticated server session; it does not accept a vendor ID from the browser. Catalog writes are limited per seller account to 20 new products and 120 product or stock updates per hour, with counters shared through PostgreSQL. Initial active categories are inserted by the `20261001030000_seed_product_categories` migration. Product image upload is not enabled yet; add images only with a controlled storage pipeline that validates file type and size.

Vendors can update stock only for their own approved, active products. Price and product details are not editable from this endpoint; changes to public-facing product content should go through moderation.

Administrators manage categories at `/admin/categories`. New categories require a Persian display name and a unique lowercase Latin slug. Deactivating a category hides its products from the public catalog and prevents new checkout quotes for them; it can be reactivated without deleting product records.

Customers can manage up to 20 saved delivery addresses at `/account/addresses`. Address changes are scoped to the signed-in account, and checkout loads saved addresses for that account only. Orders keep their own delivery-address snapshot, so changing a saved address later does not change an earlier order.

Vendors can review and fulfill their own paid suborders at `/seller/orders`. The server permits only `PAID → PROCESSING → SHIPPED`, checks the vendor owner and paid parent order in a transaction, and stores optional carrier and tracking details. Only orders confirmed by the server-side ZarinPal verification step reach this queue.

## Customer support cases

Customers can open a support case from an eligible order detail page and follow the conversation at `/account/support`. Each case belongs to one vendor suborder. Only its customer, the active owner of that vendor store, and an active administrator can read or reply. Replies are plain text, limited in size and rate, and append-only at the database level; the thread page loads at most the newest 100 messages. Administrators can move a case between waiting, review, and resolved states; status changes are recorded in the administrator audit log. A customer reply reopens a resolved case for the vendor.

This workflow records and routes a support request; it does not process a payment, refund, return, or seller payout. It does not impose a legal return deadline. Email or push notifications are not connected yet, so vendors and administrators need to review their support queues. Before public launch, define the legal return/refund policy, notification process, and response-service expectations with qualified local advisers.

## Verified payment ledger

Each server-to-server verified ZarinPal capture is recorded as one unique, append-only ledger transfer in the same database transaction that marks the payment successful. The transfer records equal debit and credit amounts between gateway clearing and unallocated order funds; retries use an idempotent payment event key. Administrators can inspect the records at `/admin/finance` and review missing entries, mismatched ledger transfers, or multiple successful captures for one order at `/admin/finance/reconciliation`. This internal capture ledger is not a cash balance, seller payable calculation, commission, tax, refund, or payout system. Its exception report does not replace daily matching against ZarinPal settlement reports. Those workflows remain disabled until the financial and legal operating rules are approved and implemented.

When an administrator rejects a product, they must provide a short review note. The vendor sees that note and can edit and resubmit rejected products; resubmission clears the old note and returns the product to `PENDING_REVIEW`. Active products cannot be edited through this flow.

## ZarinPal payment configuration

Before enabling production checkout or approving sellers, follow the internal release checklist in [the marketplace financial readiness policy](docs/marketplace-financial-readiness.md). The policy is an engineering gate, not a signed seller contract or legal/tax opinion.

The first gateway is ZarinPal. The application sends the order amount stored in the database in rials, then verifies the returned authority server-to-server against that same amount. A browser callback or its `Status` value alone never marks an order as paid. Card numbers and CVV data are never sent to or stored by this application. ZarinPal documents a minimum of 10,000 rials, equal to 1,000 tomans.

`ZARINPAL_MODE` is `disabled` by default. For local development, set it to `sandbox` and place the sandbox merchant UUID in `ZARINPAL_MERCHANT_ID` inside the ignored `.env` file. Sandbox mode is rejected in production. Live mode requires `ZARINPAL_MODE=production`, `NODE_ENV=production`, a valid merchant UUID, and the canonical HTTPS `AUTH_URL`; keep live credentials in the production secret manager. Production checkout also requires `MARKETPLACE_LIVE_CHECKOUT_ENABLED=true`, which remains false by default until seller terms, tax handling, returns, refunds, and marketplace settlement are reviewed and operational. Register the same site domain with ZarinPal before testing callbacks.

For local setup, run `.\scripts\configure-local-zarinpal.ps1` from the project directory in PowerShell. It prompts for the merchant UUID without echoing it and updates only the two ZarinPal entries in `.env`. Keep local mode `disabled` when entering a live UUID; choose `sandbox` only for a sandbox UUID. The helper leaves local `AUTH_URL=http://localhost:3000` unchanged. In the production hosting settings, set `AUTH_URL=https://janankadeh.ir` and the live merchant UUID; the callback URL is generated automatically as `https://janankadeh.ir/api/payments/zarinpal/callback`. Keep `VENDOR_APPROVAL_ENABLED=false` until the seller agreement and identity/tax review process are ready; the production admin endpoint rejects seller approvals while that gate is closed.

If a payment verifies after its stock reservation has expired and the application cannot safely reacquire all items, the order is moved to `PAYMENT_REVIEW`, blocked from seller fulfillment, and shown in the administrator order queue and audit log. An administrator must review the transaction and, if needed, issue a refund from the ZarinPal dashboard. Automated refunds and seller payouts are not implemented yet, so production checkout must remain disabled until an operational refund and marketplace-settlement procedure is in place. The ZarinPal callback remains available while checkout is disabled so already-started payments can still be verified.

## Seller onboarding release gate

In production, `VENDOR_APPROVAL_ENABLED=false` blocks both new seller applications and administrator approvals. The application form explains the pause and does not collect store details. Local development keeps the application workflow available. The flag must remain false until a reviewed seller agreement and a secure identity review process exist; the current application does not record electronic contract acceptance or identity verification.

Administrators can review environment gate states and known operational gaps at `/admin/readiness`. The page shows only readiness booleans and status labels; it never displays passwords, merchant UUIDs, API keys, or other secret values, and it is not a production release approval.

## Order stock holds

Creating an order atomically deducts its item quantities from available stock. Unpaid orders expire after 20 minutes; expiration cancels the order and its vendor suborders and restores quantities in a single database transaction. Production order creation and payment start fail closed until valid ZarinPal live configuration, a canonical HTTPS `AUTH_URL`, and `MARKETPLACE_LIVE_CHECKOUT_ENABLED=true` are present. Shipment and customer delivery-confirmation timestamps are recorded per vendor order for future return-window and settlement workflows; they do not trigger automatic seller payouts. For timely cleanup when the site is idle, configure a hosting scheduler to send `POST /api/cron/expire-orders` at least once per minute with `Authorization: Bearer <CRON_SECRET>`. Set a unique `CRON_SECRET` of at least 32 UTF-8 bytes in the production secret manager; the endpoint fails closed if the value is missing, too short, or left at the example placeholder. Never reuse `AUTH_SECRET`.
