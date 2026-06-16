# ADR 0003 — Primeiro revezamento real (identidade mínima + deploy + UX)

- **Status:** Aceito (design). **Pré-build pendente** (entrada do João): qual amigo + qual
  música (PD/CC) + instrumento que falta → decide a travessia do degrau alphaTex (a/b/c) e o
  `staveProfile`. **Nada de infra antes disso.**
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

## Critério de sucesso do marco (honesto sobre o que prova)
Você + 1 pessoa, em **máquinas diferentes**, numa instância **deployada**: A sobe uma
transcrição parcial (ex.: só guitarra), declara "falta baixo", manda o link; B abre,
**se identifica**, vê no mural "falta baixo", **reivindica o baixo**, preenche/aceita as
células; A reabre e ouve guitarra+baixo. **O bastão passou.**

Isso prova o **mecanismo** ponta a ponta com **gente e máquinas reais** — e **só isso**.
**Não** prova revezamento **orgânico** nem **densidade** (ver Riscos), e o 1º teste será
**coached** (ver "Parte 0"), então também **não** prova **autoria self-serve**. Três
incógnitas distintas, em camadas: mecanismo (este teste) → contribuição self-serve →
revezamento orgânico/densidade. Ler um polegar-pra-cima coached como "autoria resolvida"
seria o mesmo erro de ler "mecanismo provado" como "densidade provada".

## Pré-requisito de PRIMEIRA CLASSE: qual amigo + qual música
**Não é pressuposto; é entrada de design.** O build se molda a eles:
- **Quem + o que toca** define o **instrumento que falta**, que precisa **casar com o que o
  player renderiza** (ver Parte 0 / catch do `staveProfile`). Default seguro: instrumento
  **de corda** (baixo, 2ª guitarra).
- **Qual música** precisa ser **domínio público / CC / banda que quer ser transcrita** —
  dentro do grupo, não publicação aberta (reforça o copyright já anotado). A escolha da
  música do teste **é** decisão de design.
Decidir isto **antes** do build, porque muda o instrumento-alvo e talvez o `staveProfile`.

## Parte 0 — O degrau real: autoria em alphaTex (onde o teste provavelmente quebra)
A camada menos provável de derrubar o teste é infra (Postgres/cookie/deploy). A que derruba
é: **um músico de verdade consegue, sozinho, escrever uma trilha em alphaTex?** Hoje o
editor é **alphaTex bruto**. O baixista do seu amigo não necessariamente escreve notação em
texto. **Não** vamos construir o editor visual (é M5, certo deixar fora) — mas precisamos
**atravessar isso conscientemente**. Três saídas honestas, dentro da cerca:
- **(a)** escolher um amigo disposto a aprender ~15 min de alphaTex;
- **(b)** **template no editor**: ao abrir uma célula vazia, o textarea já vem com o
  **esqueleto** (estrutura do compasso + uma pausa) para ele **só editar valores**. **Cuidado:**
  isso é **template de UI**, **não** uma contribuição aceita pré-semeada — senão a célula
  contaria como pronta e o **mural mentiria** (a métrica é "tem contribuição aceita"). O slot
  segue 0% até ele salvar de verdade;
- **(c)** fazer o 1º relay **emparelhado** — você ao lado / screen-share, traduzindo "toca
  isso" → alphaTex.

**Recomendação para o 1º teste: (c) coached**, possivelmente com **(b)** ajudando. É o mais
honesto: prova que **o mecanismo completa a passagem de bastão** com gente real. **Coached
≠ self-serve** — que um músico contribua **sozinho** é uma incógnita **distinta e
posterior**, e exige justamente o que estamos adiando (editor melhor). Ir sabendo.

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

### 2a. Banco: SQLite → **Postgres gerenciado** (com uma correção de honestidade)
- **Correção de um exagero anterior:** "2 pessoas/1 música não precisam de Postgres" é
  verdade — mas nos hosts recomendados (Render/Railway) **o disco é efêmero por padrão**,
  então **SQLite-com-volume tem mais atrito que clicar "add Postgres"**. O Postgres aqui
  **não** é "resolver escala que você não tem"; é **casar com o grão da plataforma**.
- **Alternativa de zero-migração** (também dentro da cerca): um host onde **SQLite-com-volume
  é primeira-classe** — **Fly.io com volume** ou **Turso** (SQLite gerenciado/edge). Aí não
  troca o provider.
- **Não agonizar:** escolher pela que você **termina esta semana**, não pela "mais correta".
  Postgres+Render/Railway e SQLite+Fly/Turso são ambas defensáveis.
- Se Postgres: troca de `provider` no Prisma + connection string; schema (ids cuid, Int,
  Bool, DateTime, String?) porta limpo; **re-iniciar migrations** para Postgres (sem dado de
  produção a preservar).

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

**Resumo do stack recomendado:** Node persistente (`next start` do build webpack) + blob
como `Bytes` no DB, **sem object storage, sem serverless**. Duas combinações defensáveis,
escolher pela que termina esta semana:
- **Render/Railway + Postgres gerenciado** (troca provider; casa com disco efêmero), ou
- **Fly.io (volume) / Turso + SQLite** (zero-migração de banco).

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

### ⚠️ Catch concreto: instrumento que falta × o que o player renderiza
Limitação já registrada no CLAUDE.md: com `display.staveProfile: "Tab"`, **trilhas sem
corda (bateria, teclado) podem renderizar vazias**. Se o instrumento natural do amigo for
**bateria/teclado**, o player atual **sabota o teste por um motivo que não tem nada a ver
com revezamento** — mediríamos um acidente. Duas saídas:
- **Casar o instrumento** que falta com o que o player sabe mostrar → escolher **de corda**
  (baixo, 2ª guitarra). **Zero código.** (Default recomendado.)
- **Ou relaxar o `staveProfile`** para trilhas sem corda antes do teste (ex.: `Default`/
  auto por trilha — tab onde tem corda, notação onde não tem). Pequena mudança no player,
  custo: volta a clave de sol em algumas trilhas.
**Decidir junto com "qual amigo + qual música".** Se o amigo é baixista/guitarrista →
corda → zero código. Se é baterista/tecladista → relaxar `staveProfile` antes.

## Checklist de lead time (a executar só após aprovação)
0. **Pré-build (entrada de design):** definir **amigo + música (PD/CC) + instrumento que
   falta** → escolher travessia do degrau alphaTex (**rec. (c) coached**, + **(b)** template
   se ajudar) e `staveProfile` (corda = zero código; sem corda = relaxar antes).
1. **Identidade:** `User` model; `Track.ownerId`, `CellContribution.authorId`; trocar o
   gate `assertCanAccept` para userId; prompt + cookie assinado; header.
2. **Banco:** Postgres (trocar provider, re-init migrations) **ou** SQLite+Fly/Turso
   (zero-migração) — escolher pela que termina esta semana.
3. **Blob no DB:** coluna `Bytes`; rota de arquivo serve do DB; remover dependência de disco.
4. **Deploy:** Node host (`next build --webpack` + `next start`), banco, secrets (cookie
   secret, DB url). Smoke test remoto.
5. **UX:** botão compartilhar; identidade no editor/claim; **(b)** template de célula vazia
   (se escolhido).

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
