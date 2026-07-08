# ADR 0004 — Identidade durável: magic link + sessão JWT (aposenta o cookie)

- **Status:** Aceito e implementado. **Data:** 2026-07-05
- **Contexto anterior:** [ADR 0003](0003-primeiro-revezamento-real.md) (identidade leve
  por cookie assinado, com o **upgrade para magic link já previsto**).

## Context
A identidade do M2 era um **cookie assinado com o `userId`** (ADR 0003, honestamente
rotulado "não é auth"). Suficiente para o 1º revezamento coached, mas frágil para a tese:
- O revezamento é **assíncrono e dura dias**; a **autoria por pedaço** é diferencial
  estrutural. Quem **limpa o cookie ou troca de aparelho** vira um estranho anônimo e
  **perde a autoria** — o oposto do que o produto promete.
- O `User` nem tinha campo de e-mail; não havia **canal para avisar "sua vez"** (o item de
  notificação assíncrona depende do mesmo substrato: e-mail).

O ADR 0003 já dizia "upgrade = magic link". Fazer isso **junto com a notificação** é o
movimento natural: e-mail dá **identidade portável** *e* o **canal de aviso**.

## Decision
**Autenticação passwordless por magic link, com sessão JWT** — modelo consagrado
(Slack/Notion/Vercel). O **cookie-como-identidade** (HMAC do `userId`) está **aposentado**.

- **Âncora de identidade = e-mail verificado** (`User.email @unique`, `User.emailVerified`).
  Durável, cross-device: a autoria sobrevive a limpar cookie / trocar de celular.
- **Login = magic link** (sem senha): e-mail → link único → sessão. Token de uso único,
  **só o hash** é guardado (`LoginToken.tokenHash`, SHA-256), TTL 30 min, queimado no 1º uso.
- **Sessão = JWT** (`jose`, HS256, exp 30 dias) em **cookie httpOnly** (`gs_session`). O
  cookie continua sendo o *transporte* seguro padrão; o que mudou é que **perder o cookie
  não perde a identidade** — reautentica-se pelo e-mail e cai no **mesmo `User`**.
- **Ponte de migração (transitória):** no `verify`, se o **cookie legado `gs_uid`** ainda
  existir, o e-mail é **anexado à conta existente** (não cria duplicata) — os primeiros
  usuários **mantêm suas contribuições**. É o único resquício de leitura do cookie antigo
  (`readLegacyCookieUserId`), marcado para remoção depois de migrados.
- **E-mail = canal de notificação:** eventos diretos de alto sinal (proposta recebida /
  aceita / recusada) também **saem por e-mail** ("sua vez"); o fan-out para seguidores
  (progresso/slot) fica **só in-app** (evita tempestade de e-mail).
- **Provider-agnóstico, sem dependência de SDK:** `RESEND_API_KEY` → envia via HTTP do
  Resend (`fetch`); sem chave → **modo dev** (loga o link no console e devolve na resposta
  do form). Trocar para SMTP/Postmark/SES é mudar uma função em `src/lib/email.ts`.

`getCurrentUser()` **manteve a assinatura** (lê o JWT, carrega o `User`), então as 18 rotas
que dependem dela **não mudaram** — a troca ficou contida em `src/lib/identity.ts`.

## Consequences
- **Ganho central:** identidade que sobrevive ao tempo e ao aparelho → autoria preservada
  de verdade + canal para fechar o ciclo assíncrono ("sua vez" por e-mail).
- **Novos segredos/infra:** `GS_AUTH_SECRET` (assina o JWT; cai para `GS_COOKIE_SECRET`),
  `RESEND_API_KEY`/`EMAIL_FROM` (e-mail real em prod), `APP_URL` (URL absoluta atrás de
  proxy). Nada obrigatório em dev.
- **Fora de escopo (ainda):** senha, OAuth, rotação/revogação de sessão server-side (JWT é
  stateless; um `Session` table viria se precisar revogar), rate-limit no `request`,
  verificação anti-enumeração de e-mail, perfis/rename. Coerente com "pequeno, provado".
- **Migração:** aditiva (`20260705120000_magic_link_auth`). ⚠️ Reiniciar o `next dev` após
  aplicar — o client Prisma em memória fica velho.

## Verified
Prova de ponta a ponta no Neon: signup, uso único do token, round-trip do JWT, login de
retorno sem duplicar, **ponte legado (anexa e-mail à conta existente)**, expiração e token
inválido. Typecheck limpo; rotas HTTP compilando (400 de e-mail inválido antes do DB).
