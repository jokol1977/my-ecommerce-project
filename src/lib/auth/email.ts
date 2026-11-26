import "server-only";
import nodemailer from "nodemailer";
import { hasUsableEmailConfig } from "@/lib/auth-config";

type MailTransport = ReturnType<typeof nodemailer.createTransport>;
let transport: MailTransport | undefined;

function getTransport(): MailTransport {
  if (!hasUsableEmailConfig()) throw new Error("Email delivery is not configured.");
  if (transport) return transport;

  const secure = process.env.SMTP_SECURE === "true";
  transport = nodemailer.createTransport({
    host: process.env.SMTP_HOST!,
    port: Number(process.env.SMTP_PORT),
    secure,
    requireTLS: !secure,
    auth: { user: process.env.SMTP_USER!, pass: process.env.SMTP_PASSWORD! },
    connectionTimeout: 5_000,
    greetingTimeout: 5_000,
    socketTimeout: 10_000,
    tls: { minVersion: "TLSv1.2" },
    disableFileAccess: true,
    disableUrlAccess: true,
  });
  return transport;
}

/** Send a short-lived login code. Callers must never log the code or recipient. */
export async function sendEmailLoginCode(email: string, code: string): Promise<void> {
  if (!/^\d{6}$/.test(code)) throw new Error("Invalid email login code.");
  await getTransport().sendMail({
    from: process.env.EMAIL_FROM!,
    to: email,
    subject: "کد ورود به جانان‌کده",
    text: `کد ورود شما: ${code}\nاین کد ۱۰ دقیقه اعتبار دارد و فقط یک‌بار قابل استفاده است. اگر شما درخواست نداده‌اید، این پیام را نادیده بگیرید.`,
  });
}
