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

---

## Atualização (2026-07-10) — Google sign-in + modal estilo ChatGPT

**Decisão:** adicionar **Google** como provedor social, **sem** trocar a âncora de
identidade nem adotar `next-auth`.

- **Google só AUTENTICA; o e-mail continua sendo a âncora.** Toda entrada (magic link ou
  Google) passa por **`resolveUserForEmail()`** — extraído de `consumeLoginToken` para ser
  o **único** lugar onde um e-mail verificado vira `User`. Consequência provada em teste:
  entrar com Google num e-mail que já entrou por magic link **cai na mesma conta** (não
  duplica, não sobrescreve o `displayName`). A ponte de conta legada vale para os dois.
- **Fluxo:** OIDC **authorization code + PKCE (S256)**, `state` e `code_verifier` em
  cookies httpOnly de 10 min. O `id_token` é verificado contra o **JWKS do Google**
  (assinatura + `iss` + `aud`, via `jose`). **Recusamos `email_verified !== true`** — senão
  alguém poderia reivindicar uma conta cujo endereço não controla.
- **Sem `next-auth`:** manteria duas noções de sessão (a dele e o nosso JWT). Hand-roll de
  ~100 linhas (`src/lib/google.ts`) casa com o resto do código e não muda `getCurrentUser`.
- **Degrada com elegância:** sem `GOOGLE_CLIENT_ID`/`SECRET`, `GET /api/auth/providers`
  devolve `{google:false}` e o modal **esconde o botão**, sobrando o magic link.
- **UI:** `Entrar` abre um **modal** (`AuthModal`, via portal): "Continuar com Google" →
  divisor "ou" → e-mail (magic link) → estado "confira seu e-mail". Fecha no Esc/backdrop/✕.
  Erros do redirect (`?auth_error=google_denied|google_state|…`) reabrem o modal com a razão.
- **Rotas:** `GET /api/auth/google` (inicia), `GET /api/auth/google/callback` (troca o code,
  verifica, abre sessão), `GET /api/auth/providers`.
- **Segredos:** `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`. Redirect URI exato:
  `${APP_URL}/api/auth/google/callback`.

**Verified:** magic link sem regressão, **convergência Google↔magic-link no mesmo `User`**,
signup só-Google, ponte legada, `challenge === S256(verifier)`, e `providers` refletindo o
env. Rotas redirecionam com `auth_error=google_unconfigured` quando não configurado.
