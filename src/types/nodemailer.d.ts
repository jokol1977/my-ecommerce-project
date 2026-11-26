declare module "nodemailer" {
  interface MailMessage {
    from: string;
    to: string;
    subject: string;
    text: string;
  }

  interface TransportOptions {
    host: string;
    port: number;
    secure: boolean;
    requireTLS: boolean;
    auth: { user: string; pass: string };
    connectionTimeout: number;
    greetingTimeout: number;
    socketTimeout: number;
    tls: { minVersion: string };
    disableFileAccess: boolean;
    disableUrlAccess: boolean;
  }

  interface Transporter {
    sendMail(message: MailMessage): Promise<unknown>;
  }

  function createTransport(options: TransportOptions): Transporter;
  const nodemailer: { createTransport: typeof createTransport };
  export { createTransport, Transporter };
  export default nodemailer;
}
