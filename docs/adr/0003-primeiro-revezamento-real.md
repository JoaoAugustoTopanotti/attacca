# ADR 0003 — Primeiro revezamento real (identidade mínima + deploy + UX)

- **Status:** Proposto (design para aprovação) — **nada de infra antes do OK**
- **Data:** 2026-06-16
- **Contexto anterior:** [ADR 0001](0001-formato-canonico.md), [ADR 0002](0002-modelo-de-celulas.md)

## Context
Todo o **mecanismo** do M2 está construído e provado **solo** (Stairway/seed): formato
canônico, grid, materialização, edição/PR por célula, reivindicação de trilha (portão
social) e mural de incompletude. Mas a **tese central — o revezamento e a densidade — só
se prova com uma 2ª pessoa.** O próximo marco **não é mais mecanismo**; é o **primeiro
revezamento real**: duas pessoas completam **uma** música juntas, assíncrono, cada uma no
seu instrumento. Isso força as duas coisas que adiamos de propósito (e bem) enquanto o
núcleo técnico assustador estava sem prova: **identidade "real o suficiente"** e **deploy
compartilhável** — ambas com **lead time**. Princípio guia continua valendo: pequeno,
nichado, provado de ponta a ponta. **Não** virar catedral de mecanismo sem usuário (Parture).

## Critério de sucesso do marco
Você + 1 pessoa, em **máquinas diferentes**, numa instância **deployada**: A sobe uma
transcrição parcial (ex.: só guitarra), declara "falta baixo", manda o link; B abre,
**se identifica**, vê no mural "falta baixo", **reivindica o baixo**, preenche/aceita as
células; A reabre e ouve guitarra+baixo. **O bastão passou.** Se isso acontecer uma vez
com gente de verdade, a tese deixou de ser hipótese.

---

## Parte 1 — Identidade "real o suficiente"
**Decisão:** identidade **leve, ancorada em cookie** (sem senha, sem e-mail), suficiente
para distinguir duas pessoas e tornar o portão social **semi-real**.

- 1ª visita → "quem é você?" → nome → o servidor cria um **`User`** (`id`, `displayName`,
  `createdAt`) e seta um **cookie assinado** (`userId`). Visitas seguintes = mesma
  identidade. Header mostra "você é X".
- O **portão de aceitar** passa de *match de string* (`Track.ownerName === actingName`)
  para *match de id* (`Track.ownerId === userId`) — **exatamente a "mudança pequena" que a
  ADR-0002 antecipou**. `CellContribution` ganha `authorId` (mantendo `authorName` como
  display denormalizado).
- **Real o suficiente, e honesto sobre o limite:** identidade é por-navegador. Pessoa em
  dois dispositivos = duas identidades. Aceitável para o 1º teste (2 pessoas conhecidas,
  nicho confiável). **Não** é auth de verdade — e não finge ser.
- **Upgrade documentado (quando passar do teste fechado):** **magic link** (e-mail →
  link → sessão), que torna a identidade portável entre dispositivos. Precisa de envio de
  e-mail (Resend/Postmark) — lead time extra, fora do 1º relay.
- **Fora de escopo:** senha, OAuth, verificação, recuperação, perfis. Sem controle de
  acesso por música (qualquer um com o link participa — coerente com nicho confiável).

## Parte 2 — Persistência & deploy (recomendação, com prós/contras)
Hoje: **SQLite** (`prisma/dev.db`) + **blobs em disco** (`storage/`) + Next 16 em
**webpack** + alphaTab no servidor via `serverExternalPackages`. Três decisões:

### 2a. Banco: SQLite → **Postgres gerenciado**
- Troca de `provider` no Prisma + connection string. Nosso schema (ids cuid, Int, Bool,
  DateTime, String?) porta limpo. As migrations atuais são SQLite-específicas → **re-iniciar
  o histórico de migrations para Postgres** (não há dado de produção a preservar).
- Recomendo **Neon** ou **Render Postgres** (gerenciado, free tier, simples).

### 2b. Blobs de upload: **guardar os bytes no próprio DB** (adia object storage)
- **Insight que simplifica o deploy:** a **verdade viva** é o grid de células + o alphaTex
  canônico, **tudo no DB**. O blob (`.gp`) é só **proveniência**. O player do relay carrega
  do **assembled (DB)**, não do disco. Logo o 1º relay **não precisa de object storage**.
- Recomendo, para o 1º relay: **guardar o blob como `Bytes` numa coluna** (arquivos GP são
  ~100 KB) — proveniência preservada, deploy **só-DB**, sem disco efêmero. (Alternativa
  ainda mais enxuta: **não** persistir o blob, só o alphaTex canônico.)
- **Object storage (R2/S3)** vira problema de *escala* (muitos blobs grandes), **não** do
  1º relay. Adiado conscientemente.

### 2c. Host: **Node persistente** (não serverless)
- Rodamos alphaTab **no servidor** (import/export) e o build é **webpack** (`next build
  --webpack` → `next start`). Isso é mais previsível num **processo Node de longa duração**
  (igual ao nosso dev) do que em funções serverless (limites de bundle, cold start,
  alphaTab como external).
- Recomendo **Render** ou **Railway** (web service Node + Postgres no mesmo painel). 
- **Vercel:** ótimo para Next "padrão", mas nosso webpack-mode + alphaTab-no-servidor pede
  cuidado (bundle/serverless). Não recomendo para o 1º teste — menos atrito no Node host.

**Resumo do stack recomendado:** Render/Railway (Node, `next start` do build webpack) +
Postgres gerenciado (Neon/Render) + blob como `Bytes` no DB. **Sem object storage, sem
serverless.**

## Parte 3 — UX do relay (2 pessoas, 1 música)
A história ponta a ponta que queremos **possibilitar e observar**:
1. **A (começa):** cria música → sobe `.gp` parcial (guitarra) → materializa → declara
   "precisa de Baixo, Bateria" → **copia o link** → manda pra B.
2. **B (entra):** abre o link → **se identifica** (nome → cookie) → vê o **mural**:
   guitarra 100%, baixo/bateria 0% ("falta baixo, bateria") → **Reivindica o Baixo** → abre
   o editor → preenche as células do baixo (como dono, aceita; ou propõe).
3. **A (volta):** reabre → vê o baixo preenchido → toca guitarra+baixo remontado. **Relay.**

Lacunas pequenas a fechar (UX, não mecanismo):
- **Botão "compartilhar"** (copiar link da música).
- **Prompt de identidade** na 1ª visita + "você é X" no header; o editor usa a identidade
  (não o campo de nome livre); claim/aceitar usam `userId`.
- **Sem** notificação/tempo-real: A reabre para ver (assíncrono, de propósito).

## Migrações / checklist de lead time (a executar só após aprovação)
1. **Identidade:** `User` model; `Track.ownerId`, `CellContribution.authorId`; trocar o
   gate `assertCanAccept` para userId; prompt + cookie assinado; header.
2. **Postgres:** trocar provider, re-init migrations, `DATABASE_URL`.
3. **Blob no DB:** coluna `Bytes`; rota de arquivo serve do DB; remover dependência de disco.
4. **Deploy:** Render/Railway web service (`next build --webpack` + `next start`), Postgres,
   secrets (cookie secret, DB url). Smoke test remoto.
5. **UX:** botão compartilhar; identidade no editor/claim.

## Fora de escopo (explícito)
Auth robusta, e-mail, OAuth, object storage, notificações, tempo-real, controle de acesso
por música, multi-tenant. Tudo isso vem **depois** que o 1º relay provar a tese.

## Riscos / como manter pequeno
- **Risco do marco:** transformar "deploy + identidade" num projeto grande. Mitigação: o
  stack acima é o **mínimo** (Node host + Postgres + cookie). Sem object storage, sem auth.
- **Risco de produto (o real):** mesmo deployado, o revezamento pode **não acontecer** — é
  o teste da tese, e pode falhar. Isso é informação, não defeito. Melhor falhar barato com
  1 música e 1 amigo do que construir mais mecanismo no escuro.
- **Copyright (ADR/CLAUDE):** o 1º relay deve usar **domínio público / CC / banda que quer
  ser transcrita**, dentro do grupo — não publicação aberta. A escolha da música do teste
  importa.
