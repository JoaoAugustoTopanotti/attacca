// Envio de e-mail — a base tanto do login por magic link quanto das
// notificações de "sua vez". Agnóstico de provedor e sem dependências:
//   • com RESEND_API_KEY → envia pela API HTTP do Resend (fetch, sem SDK);
//   • sem chave          → modo dev: loga no console do servidor e a rota de
//                          auth devolve o link fora de produção.
// Trocar por SMTP/Postmark/SES depois é mexer em uma função só.

const RESEND_API_KEY = process.env.RESEND_API_KEY;
const EMAIL_FROM = process.env.EMAIL_FROM ?? "attacca <onboarding@resend.dev>";

export const emailConfigured = !!RESEND_API_KEY;

export type EmailMessage = {
  to: string;
  subject: string;
  html: string;
  text: string;
};

/** Envia um e-mail. Best-effort: devolve false na falha e nunca lança. */
export async function sendEmail(msg: EmailMessage): Promise<boolean> {
  if (!RESEND_API_KEY) {
    // Modo dev, sem provedor configurado: loga para o fluxo ser testável.
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

const BRAND = "#e5432b";
const INK = "#141414";

/** Casca HTML mínima com estilo inline, para renderizar em qualquer cliente. */
function shell(bodyHtml: string): string {
  return `<div style="font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;max-width:520px;margin:0 auto;padding:24px;color:#1b1f24;">
  <div style="font-weight:600;font-size:20px;letter-spacing:-0.02em;margin-bottom:16px;">attacca</div>
  ${bodyHtml}
  <hr style="border:none;border-top:1px solid #e5e7eb;margin:24px 0;">
  <div style="font-size:12px;color:#8b949e;">Transcrições musicais colaborativas — alguém começa, você continua. Se você não esperava este e-mail, pode ignorá-lo.</div>
</div>`;
}

function button(href: string, label: string): string {
  return `<a href="${href}" style="display:inline-block;background:${INK};color:#fff;text-decoration:none;padding:10px 20px;border-radius:8px;font-weight:600;">${label}</a>`;
}

/** E-mail de login sem senha (magic link). */
export async function sendMagicLink(to: string, url: string): Promise<boolean> {
  return sendEmail({
    to,
    subject: "Seu link de acesso ao attacca",
    text: `Entre no attacca com este link (expira em breve):\n${url}`,
    html: shell(
      `<p style="font-size:15px;line-height:1.5;">Clique para entrar no attacca. O link expira em breve e só funciona uma vez.</p>
       <p style="margin:20px 0;">${button(url, "Entrar no attacca")}</p>
       <p style="font-size:12px;color:#8b949e;">Ou copie e cole: <br>${url}</p>`,
    ),
  });
}

/** E-mail de notificação "sua vez" (proposta recebida ou revisada). */
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
       <p style="margin:20px 0;">${button(args.url, "Abrir no attacca")}</p>`,
    ),
  });
}
