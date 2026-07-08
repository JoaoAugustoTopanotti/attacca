// Email sending — the substrate for both magic-link auth and "sua vez"
// notifications. Provider-agnostic and dependency-free:
//   • RESEND_API_KEY set  → send via Resend's HTTP API (fetch, no SDK).
//   • otherwise           → dev mode: log to the server console (and let the
//                           auth request echo the link back in non-production).
// Swapping to SMTP/Postmark/SES later is a one-function change here.

const RESEND_API_KEY = process.env.RESEND_API_KEY;
const EMAIL_FROM = process.env.EMAIL_FROM ?? "GitSong <onboarding@resend.dev>";

export const emailConfigured = !!RESEND_API_KEY;

export type EmailMessage = {
  to: string;
  subject: string;
  html: string;
  text: string;
};

/** Send one email. Best-effort: returns false on failure, never throws. */
export async function sendEmail(msg: EmailMessage): Promise<boolean> {
  if (!RESEND_API_KEY) {
    // Dev mode — no provider configured. Surface it so the flow is testable.
    console.log(
      `\n[email:dev] to=${msg.to}\n  subject: ${msg.subject}\n  ${msg.text.replace(/\n/g, "\n  ")}\n`,
    );
    return true;
  }
  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${RESEND_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: EMAIL_FROM,
        to: msg.to,
        subject: msg.subject,
        html: msg.html,
        text: msg.text,
      }),
    });
    if (!res.ok) {
      console.error("resend send failed", res.status, await res.text().catch(() => ""));
      return false;
    }
    return true;
  } catch (e) {
    console.error("email send error", e);
    return false;
  }
}

const BRAND = "#58a6ff";

/** Minimal, inline-styled HTML shell so it renders in any mail client. */
function shell(bodyHtml: string): string {
  return `<div style="font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;max-width:520px;margin:0 auto;padding:24px;color:#1b1f24;">
  <div style="font-weight:700;font-size:18px;margin-bottom:16px;">♪ GitSong</div>
  ${bodyHtml}
  <hr style="border:none;border-top:1px solid #e5e7eb;margin:24px 0;">
  <div style="font-size:12px;color:#8b949e;">Transcrições musicais colaborativas. Se você não esperava este e-mail, pode ignorá-lo.</div>
</div>`;
}

function button(href: string, label: string): string {
  return `<a href="${href}" style="display:inline-block;background:${BRAND};color:#fff;text-decoration:none;padding:10px 20px;border-radius:8px;font-weight:600;">${label}</a>`;
}

/** The passwordless sign-in email. */
export async function sendMagicLink(to: string, url: string): Promise<boolean> {
  return sendEmail({
    to,
    subject: "Seu link de acesso ao GitSong",
    text: `Entre no GitSong com este link (expira em breve):\n${url}`,
    html: shell(
      `<p style="font-size:15px;line-height:1.5;">Clique para entrar no GitSong. O link expira em breve e só funciona uma vez.</p>
       <p style="margin:20px 0;">${button(url, "Entrar no GitSong")}</p>
       <p style="font-size:12px;color:#8b949e;">Ou copie e cole: <br>${url}</p>`,
    ),
  });
}

/** A "sua vez" style notification email (proposal received / reviewed). */
export async function sendNotificationEmail(args: {
  to: string;
  title: string;
  message: string;
  songTitle: string;
  url: string;
}): Promise<boolean> {
  return sendEmail({
    to: args.to,
    subject: `${args.title} · ${args.songTitle}`,
    text: `${args.message}\n\nAbra: ${args.url}`,
    html: shell(
      `<p style="font-size:15px;line-height:1.5;"><strong>${args.title}</strong></p>
       <p style="font-size:15px;line-height:1.5;">${args.message}</p>
       <p style="margin:20px 0;">${button(args.url, "Abrir no GitSong")}</p>`,
    ),
  });
}
