import { NextResponse } from "next/server";
import { getCurrentUser, issueLoginToken, appBaseUrl } from "@/lib/identity";
import { sendMagicLink, emailConfigured } from "@/lib/email";
import { prisma } from "@/lib/prisma";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// POST /api/me/email { email } — define ou troca a âncora de identidade.
// O e-mail só muda depois que a pessoa prova o controle da nova caixa: um magic
// link, ao ser consumido, anexa o endereço a esta conta in place e volta para as
// configurações. Até lá, nada é alterado.
export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Entre para trocar seu e-mail." }, { status: 401 });
  }

  const body = await request.json().catch(() => ({}));
  const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";

  if (!EMAIL_RE.test(email)) {
    return NextResponse.json({ error: "E-mail inválido." }, { status: 400 });
  }
  if (email === user.email) {
    return NextResponse.json({ error: "Esse já é o seu e-mail." }, { status: 400 });
  }

  const taken = await prisma.user.findUnique({ where: { email }, select: { id: true } });
  if (taken && taken.id !== user.id) {
    return NextResponse.json(
      { error: "Esse e-mail já pertence a outra conta." },
      { status: 409 },
    );
  }

  const raw = await issueLoginToken({
    email,
    claimUserId: user.id,
    redirectTo: "/settings?email=changed",
  });
  const url = `${appBaseUrl(request)}/api/auth/verify?token=${encodeURIComponent(raw)}`;

  await sendMagicLink(email, url);

  // Em dev, sem provedor de e-mail, devolve o link para o fluxo ser testável.
  const devUrl = !emailConfigured && process.env.NODE_ENV !== "production" ? url : undefined;
  return NextResponse.json({ ok: true, sent: emailConfigured, devUrl });
}
