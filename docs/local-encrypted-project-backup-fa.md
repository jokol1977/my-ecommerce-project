# نسخهٔ رمزگذاری‌شدهٔ محلی پروژه

این روش از پوشهٔ فعلی پروژه در `D:\my-ecommerce-project` یک آرشیو `tar.gz.age` در پوشهٔ `backups` می‌سازد. رمزگذاری با `age` در WSL انجام می‌شود و رمز فقط در همان پنجرهٔ PowerShell وارد می‌شود؛ آن را در گفتگو یا فایل معمولی ذخیره نکنید.

## ساخت نسخه

در PowerShell ویندوز این فرمان را اجرا کنید:

```powershell
wsl.exe --exec bash /mnt/d/my-ecommerce-project/scripts/create-encrypted-project-backup.sh
```

درخواست `age` را با یک عبارت عبور قوی و غیرخالی پاسخ دهید؛ برای ساخت، آن را دو بار و برای بررسی آرشیو یک بار دیگر وارد کنید. خروجی، مسیر فایل و SHA-256 آن را نشان می‌دهد. اسکریپت آرشیو را مستقیماً از `tar` به `age` می‌فرستد؛ آرشیو موقتِ بدون رمز روی دیسک ایجاد نمی‌شود.

آرشیو شامل فایل‌های مخفی، `.git`، فایل‌های محلی تنظیمات مانند `.env*`، dumpها و بکاپ‌های دیگر، مستندات و فایل‌های رسانه‌ای موجود در پروژه است. آرشیوهای رمزدار قبلی پروژه عمداً وارد نسخهٔ جدید نمی‌شوند تا داخل هم تکرار نشوند؛ `node_modules` و `.next` نیز چون وابستگی‌ها و خروجی‌های بازتولیدپذیرند کنار گذاشته می‌شوند. فایل‌های تنظیمات داخل خود آرشیو رمزگذاری می‌شوند.

## کپی به USB و تطبیق هش

پس از ساخت موفق آرشیو، این فرمان‌ها را در PowerShell ویندوز (نه پنجرهٔ WSL) اجرا کنید. بلوک، تازه‌ترین فایل `.age` را به پوشهٔ USB کپی می‌کند و SHA-256 مبدأ و مقصد را می‌سنجد؛ در صورت نابرابری متوقف می‌شود. فایل مبدأ را تا دیدن `Match: True` نگه دارید.

```powershell
$src = Get-ChildItem -LiteralPath 'D:\my-ecommerce-project\backups' -Filter 'janankadeh-project-*.tar.gz.age' -File | Sort-Object LastWriteTime -Descending | Select-Object -First 1
if (-not $src) { throw 'فایل بکاپ پیدا نشد.' }
$dstDir = 'G:\janankadeh-backups'
New-Item -ItemType Directory -Force -Path $dstDir | Out-Null
$dst = Join-Path $dstDir $src.Name
if (Test-Path -LiteralPath $dst) { throw "فایل مقصد از قبل وجود دارد؛ چیزی بازنویسی نشد: $dst" }
Copy-Item -LiteralPath $src.FullName -Destination $dst
$sourceHash = (Get-FileHash -LiteralPath $src.FullName -Algorithm SHA256).Hash
$copyHash = (Get-FileHash -LiteralPath $dst -Algorithm SHA256).Hash
"File: $($src.Name)"
"Source SHA-256: $sourceHash"
"Copy SHA-256: $copyHash"
"Match: $($sourceHash -eq $copyHash)"
if ($sourceHash -ne $copyHash) { throw 'هش فایل مبدأ و کپی برابر نیست.' }
```

حرف درایو به‌تنهایی رسانهٔ فیزیکی جدا را ثابت نمی‌کند. در رایانه‌ای که این راهنما برای آن نوشته شده، بررسی فقط‌خواندنی نشان داد D: روی SSD داخلی و G: روی USB فیزیکی جداست؛ اگر مقصد یا سخت‌افزار عوض شد، این موضوع را دوباره بررسی کنید. عبارت عبور را فقط در prompt خود `age` وارد کنید، نه در فرمان‌ها یا گفتگو.

## بازگردانی

برای استخراج، ابتدا مقصد خالی و موردنظر را در WSL بسازید و به‌جای `<archive>` و `<destination>` مسیرهای واقعی را قرار دهید:

```bash
age --decrypt '<archive>' | tar -xzf - -C '<destination>'
```

عبارت عبور را جدا از همین دیسک نگه دارید؛ بدون آن آرشیو قابل بازکردن نیست. این نسخه روی همان رایانه و همان درایو D: می‌ماند، پس خرابی یا گم‌شدن آن درایو را پوشش نمی‌دهد. برای نسخهٔ مستقل، پس از ساخت، فایل `.age` را به رسانه یا فضای ذخیره‌سازی دیگری که خودتان کنترل می‌کنید کپی کنید.
