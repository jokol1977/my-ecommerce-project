# راه‌اندازی Nginx و HTTPS

این راهنما برای سرور لینوکسیِ سایت است؛ روی لپ‌تاپ ویندوزی گواهی دامنه صادر نمی‌کند. صدور گواهی پس از آماده‌شدن سرور و اتصال دامنه انجام می‌شود.

## پیش‌نیازها

1. یک VPS لینوکسی با نشانی IPv4 عمومی تهیه شده باشد. برای این راهنما، Ubuntu LTS انتخاب ساده‌ای است.
2. رکورد DNS از نوع A برای janankadeh.ir به نشانی IPv4 سرور اشاره کند. اگر رکورد AAAA وجود دارد، باید به IPv6 همین سرور اشاره کند؛ در غیر این صورت آن رکورد را حذف کنید.
3. در پنل میزبان و فایروال سیستم، ورودی TCP روی درگاه‌های 80 و 443 باز باشد. روش صدور این راهنما از بررسی HTTP-01 استفاده می‌کند که به درگاه 80 نیاز دارد.
4. برنامهٔ سایت روی 127.0.0.1:3000 در حال اجرا باشد. Nginx در مرحلهٔ نصب پایین‌تر نصب می‌شود.

## نصب اولیهٔ گواهی

1. این دستورها را در ترمینال SSH سرور Ubuntu و از حسابی با دسترسی sudo اجرا کنید. در Ubuntu، Nginx و Snap را نصب کنید:

       sudo apt update
       sudo apt install nginx snapd

   اگر Certbot را قبلاً با apt نصب کرده‌اید، پیش از نصب نسخهٔ Snap این فرمان را اجرا کنید تا فرمان `certbot` به نسخهٔ درست اشاره کند:

       sudo apt remove certbot

   سپس Certbot را طبق [راهنمای رسمی نصب](https://certbot.eff.org/instructions?os=snap&tab=standard&ws=other) نصب و فرمان آن را در مسیر قابل‌اجرا قرار دهید:

       sudo snap install certbot --classic
       sudo ln -s /snap/bin/certbot /usr/local/bin/certbot

   اگر از توزیع دیگری استفاده می‌کنید، روش نصب همان توزیع را از راهنمای رسمی Certbot انتخاب کنید.
2. مسیر فایل‌های بررسی دامنه را بسازید:

       sudo install -d -m 0755 /var/www/certbot/.well-known/acme-challenge

3. در ترمینال SSH به پوشهٔ پروژه بروید. دستور زیر فرض می‌کند پروژه در `/opt/janankadeh` قرار دارد؛ اگر آن را در مسیر دیگری نصب کرده‌اید، همان مسیر را وارد کنید:

       cd /opt/janankadeh

   در Nginx فقط پیکربندی موقت HTTP را فعال کنید. این دستورها برای سروری هستند که هنوز پیکربندی‌ای با نام janankadeh ندارد:

       sudo cp deploy/nginx/janankadeh-bootstrap.conf /etc/nginx/sites-available/janankadeh-bootstrap.conf
       sudo ln -s /etc/nginx/sites-available/janankadeh-bootstrap.conf /etc/nginx/sites-enabled/janankadeh
       sudo nginx -t
       sudo systemctl reload nginx

4. برای دامنه گواهی بگیرید. به‌جای نشانی نمونه، ایمیل مدیریتی واقعی را وارد کنید:

       sudo certbot certonly --webroot --webroot-path /var/www/certbot -d janankadeh.ir -m admin@example.com --agree-tos --non-interactive --no-eff-email

5. پس از موفقیت صدور گواهی، پیکربندی موقت را با deploy/nginx/janankadeh.conf جایگزین کنید، لینک فعال‌سازی را به همان فایل نهایی متصل کنید، سپس تنظیمات را بررسی و Nginx را reload کنید:

       sudo rm /etc/nginx/sites-enabled/janankadeh
       sudo cp deploy/nginx/janankadeh.conf /etc/nginx/sites-available/janankadeh.conf
       sudo ln -s /etc/nginx/sites-available/janankadeh.conf /etc/nginx/sites-enabled/janankadeh
       sudo nginx -t
       sudo systemctl reload nginx

## تمدید خودکار

1. اسکریپت تمدید گواهی را در پوشهٔ hook تمدید Certbot نصب کنید تا Nginx فقط بعد از تمدید موفق، پیکربندی را بررسی و گواهی تازه را بارگذاری کند:

       sudo install -D -m 0755 deploy/nginx/reload-after-cert-renewal.sh /etc/letsencrypt/renewal-hooks/deploy/50-reload-nginx

2. زمان‌بند تمدید خودکار را بررسی کنید. معمولاً Certbot آن را همراه نصب فعال می‌کند؛ اگر هیچ‌یک از این فرمان‌ها زمان‌بندی را نشان نداد، روش نصب را در [راهنمای رسمی Certbot](https://certbot.eff.org/instructions?os=snap&tab=standard&ws=other) بررسی کنید:

       systemctl list-timers --all | grep -i certbot
       sudo grep -R "certbot renew" /etc/cron.d /etc/cron.daily /etc/crontab 2>/dev/null

3. تمدید آزمایشی را همراه اجرای hook انجام دهید تا هم آزمون تمدید و هم بارگذاری مجدد امن Nginx بررسی شود:

       sudo certbot renew --dry-run --run-deploy-hooks

گواهی واقعی روی سرور صادر می‌شود؛ فایل خصوصی آن هرگز وارد مخزن پروژه نشود. برای توضیح نیاز درگاه 80، [راهنمای رسمی HTTP-01](https://letsencrypt.org/docs/challenge-types/) و برای تمدید و hookها [مستندات رسمی Certbot](https://eff-certbot.readthedocs.io/en/stable/using.html) را ببینید.

پس از آماده‌شدن VPS، DNS و دسترسی مدیریتی، این مراحل را روی همان سرور اجرا کنید. رمز ورود سرور را در Git یا فایل‌های پروژه ذخیره نکنید.
