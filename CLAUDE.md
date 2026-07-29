# attacca — memória do projeto

> Memória do projeto entre sessões: **o que** construímos, **por quê**, e **quais
> decisões de arquitetura** destravam o futuro. Mantenha atualizado conforme o projeto
> evolui. (O `CONTEXTO.md` é o complemento narrativo — log de sessões e handoff.)

## Marca (rebranding 2026-07-15 — era "GitSong")
- **Nome: `attacca`, sempre em minúsculas** (termo musical: seguir ao próximo movimento
  sem pausa — a continuidade mora no nome; o significado é nota de rodapé, não a
  fundação visual). Slogan: **"Alguém começa. Você continua."** Norte do design:
  *"transcrição incompleta é um convite para contribuir"*.
- **Filosofia**: a marca não promete mais do que o produto entrega (nada de landing
  SaaS com números inflados); a identidade é de **interação** (o progresso é o elemento
  recorrente), não um logotipo; a home É o produto; números pequenos mostrados com
  orgulho; humilde ≠ feio. **Wordmark simples** — o tratamento do último "a"
  (vazado/metade/colorido) foi **rejeitado**; sem símbolo elaborado por enquanto.
- **Sistema visual** (`globals.css`, tokens em `:root`): **dark é o default**
  (carvão #141311/#191713, texto #EDE9E2); tema **claro** opcional (paper #FCFBF8,
  tinta #141414) via `[data-theme="light"]` — toggle em Configurações → Aparência
  (`src/lib/theme.ts`, localStorage `attacca:theme`, script anti-flash no layout).
  **Cor = significado**: tinta = pronto; **vermelhão #E5432B** = "a sua vez"/a lacuna
  (usado com parcimônia — o que falta, CTAs de continuar, tab ativa, cursor do player);
  cinza = ainda não começou. Fontes via `next/font`: **Space Grotesk** (títulos/wordmark),
  **Inter** (texto), **JetBrains Mono** (dados/rótulos/microcopy). **Assinatura visual =
  barra de progresso em blocos** (`.blockbar`, ██████░░░░ com a "borda viva" em
  vermelhão) — presente no mural. Estética: hairlines, zero gradiente, cara de
  ferramenta. Voz/microcopy: minúscula, direta, o botão diz o que acontece
  ("Continuar →", "falta: Baixo", "ninguém começou — seja a primeira mão").
  Os players alphaTab **não herdam CSS**: cores da tablatura vêm de
  `alphaTabResources(readTheme())` (AlphaTabPlayer + TabEditor).
- **Mockups de referência**: `docs/brand/` (home = o definitivo; site = landing
  conceitual rejeitada como direção, mantida pelos tokens do tema escuro).
- **Não renomeado de propósito**: env vars `GS_AUTH_SECRET`/`GS_COOKIE_SECRET`, cookie
  `gs_session`/`gs_uid` (quebraria sessões e o deploy no Render), ADRs históricas e o
  log antigo do CONTEXTO (registro histórico). Pastas/repo GitHub: renomear é ato
  manual do João.

## Princípio guia (não esquecer)
**Pequeno, nichado, provado de ponta a ponta.** Não competir por SEO com catálogos de
800 mil músicas; não tentar "transcrever o mundo". Provar que **o revezamento acontece**
numa comunidade pequena e densa — e só então expandir. (O projeto **Parture** (2020)
teve a mesma ideia, mirou alto demais — blockchain, "toda música já gravada" — e nunca
lançou. A versão gigante é um cemitério; a que sobrevive é pequena e focada.)

## 1. A dor (o porquê)
Músicos aprendizes querem **tocar músicas juntos**, mas as transcrições disponíveis são
ou simplificadas demais (Songsterr) ou de um instrumento só (tutoriais de YouTube), que
não servem pra uma banda tocar junto. **Não existe um bom lugar para montar, em
conjunto, uma transcrição completa e fiel, com cada pessoa cuidando do seu instrumento.**
Transcrições incompletas hoje são becos sem saída — ou alguém termina sozinho, ou morrem.

## 2. Visão do produto
Uma plataforma onde uma **comunidade transforma transcrições incompletas num
revezamento**: uma pessoa começa, outra continua de onde a primeira parou, dividindo o
trabalho **por instrumento/trilha**, com **autoria de cada pedaço preservada** e
**histórico de versões**. "GitHub para tablatura" — mas o foco **não** é fork/branch/merge
genérico, e sim **completar transcrições em conjunto, por trilha, com passagem de bastão
assíncrona**. Player estilo Songsterr: tab multi-instrumento, trilha selecionável,
playback com cursor sincronizado.

## 3. Diferencial (por que não é o que já existe)
O mercado cai em três baldes, nenhum é o nosso:
1. **Wiki/convergente** (Songsterr, Ultimate Guitar): convergem a "uma versão canônica" e
   editam por cima — contribuição parcial some na fusão, autoria se dilui. Sobrescrita,
   não revezamento.
2. **Edição em tempo real** (Flat.io, Noteflight): **síncrono** (vários cursores), e não é
   construído em torno de "reivindicar trilha / marcar o que falta / passar o bastão".
3. **Autoria solo** (Guitar Pro, MuseScore): cada transcrição tem um dono; ninguém
   continua o arquivo do outro.

**Nosso diferencial estrutural:** transcrição **divisível por trilha + assíncrona +
autoria preservada + incompletude visível como convite à contribuição.**

## 4. Duas pontas + risco nº 1 (densidade)
- **Aprendizes = demanda** (querem tocar, não transcrever). **Transcritores = oferta**
  (poucos, mas existem). Como a unidade é **divisível** (uma trilha, alguns compassos), a
  barreira cai tanto que **até um aprendiz vira micro-contribuidor** (contribui só o riff
  que aprendeu) — religando demanda e oferta na cauda longa.
- **Risco nº 1 = densidade (partida a frio):** revezamento só funciona com gente
  suficiente na **mesma** música. Atacar com **densidade por nicho** (uma banda/gênero/
  jogo/instrumento onde transcritores já se aglomeram), não cobertura ampla. E
  **incompletude visível = chamado à ação** (mural de desejos: "Paint It Black — 60%,
  falta baixo e bateria").

## 5. DECISÃO DE ARQUITETURA CENTRAL — formato canônico interno
> ✅ **DECIDIDO (2026-06-07): o formato canônico é o `alphaTex`** (texto do alphaTab).
> Ver [`docs/adr/0001-formato-canonico.md`](docs/adr/0001-formato-canonico.md) — decisão
> com evidência de round-trip num `.gp` real (Stairway, 13 trilhas/167 compassos/19.786
> notas). alphaTab importa e exporta alphaTex (round-trip sem código próprio); é **texto**
> (diffável/versionável), ~70× menor que o JSON do alphaTab, e preserva 100% das notas e
> efeitos (só normaliza rests redundantes). JSON (`JsonConverter`) fica como fallback de
> alta fidelidade; **MusicXML descartado** (alphaTab não exporta). No M1 ainda guardamos
> o blob binário — isso **não é versionável**, é só uma pilha de saves; o store canônico
> em alphaTex é trabalho do M2.

O raciocínio que levou à decisão (mantido como contexto):

- **Não dá para fazer merge de blob binário do Guitar Pro.** É preciso uma
  **representação interna estruturada e endereçável** (MusicXML ou modelo próprio em
  JSON) onde se referencie "**trilha X, compasso Y**" como coisa concreta.
- **Modelo mental — grade `(trilha × compasso)`:** linhas = trilhas, colunas = compassos;
  a **unidade atômica de edição é a célula `(trilha, compasso)`**. Isso aproxima o
  problema de "planilha colaborativa", muito mais tratável que "merge de texto".
- **Como o merge funciona:**
  - Trilhas diferentes → editam linhas diferentes, **nunca colidem**. Merge trivial
    (união). Cobre ~95% do fluxo.
  - Proposta de correção em trilha alheia → estilo **pull request** (dono aceita/recusa).
  - Conflito real (mesma célula, ao mesmo tempo, diferente) → **não** resolver
    automático "de forma musicalmente esperta": detectar, mostrar as duas versões lado a
    lado, **humano escolhe** (estilo GitHub). Raro, é exceção.
  - Diff **estrutural** (sobre a árvore musical), não textual (texto cru de MusicXML não
    serve — ref. acadêmica MusicHub; lib `musicdiff` como referência de diff, lembrando
    que diff ≠ merge).

## 6. Escopo do Milestone 1 (este — fatia fina, ponta a ponta) ✅
1. Lista de músicas + criar música; cada música tem sua página.
2. Upload de Guitar Pro (`.gp/.gp3/.gp4/.gp5/.gpx`) ou MusicXML (`.xml/.musicxml`).
3. Render + playback no navegador com **alphaTab**: tab, trilha selecionável, play/pause/
   parar, cursor sincronizado e barra de transporte (seek + tempo).
4. Cada upload vira uma **revisão**; histórico permite ver/tocar/reverter qualquer
   revisão anterior.

### Fora de escopo agora (não construir)
- Editor de tab no navegador (alphaTab é renderizador/player; edição vem depois).
- Login robusto, pagamento, licenciamento, takedown (hoje: stub — autor é texto livre).
- A camada de "completar em conjunto" por trilha e o merge (é o M2).

## 7. Stack e convenções
- **Next.js 16 (App Router) + TypeScript + React 19.**
- **alphaTab** (`@coderline/alphatab`) + plugin oficial `@coderline/alphatab-webpack`.
  - **LGPL**: usado só como dependência npm; **não** vendorizar/modificar o código dele.
    Em dúvida sobre a API, consultar **alphatab.net** antes de improvisar.
  - O plugin é de **webpack**, então dev/build rodam com `--webpack` (ver `package.json`),
    **não** com o Turbopack padrão do Next 16.
  - O plugin empacota Web Worker + Audio Worklet e copia os assets (fonte Bravura e
    soundfont SONiVOX). Em `next.config.mjs`, `assetOutputDir: public/` → o Next serve em
    `/font/` e `/soundfont/` (gitignored, gerados).
  - O player (`src/components/AlphaTabPlayer.tsx`) é `"use client"` e importa o alphaTab
    **dinamicamente dentro do `useEffect`** (nunca no topo), para não rodar no SSR.
  - Settings: `core.fontDirectory="/font/"`, `player.soundFont="/soundfont/sonivox.sf2"`,
    `enablePlayer`, `enableCursor`, `scrollMode=Continuous`; `display.staveProfile="Tab"`
    (só tablatura), `display.scale` aumentado e `display.resources` com cores claras
    (**tema escuro**). Cursor estilizado via CSS (`.at-cursor-bar/.at-cursor-beat/...`).
- **Prisma 6 + PostgreSQL** (produção) / SQLite (dev local, `prisma/dev.db`). Prisma 6
  de propósito: o 7 exige `prisma.config.ts` + driver adapter, peso desnecessário.
  Cliente de `@prisma/client` via singleton em `src/lib/prisma.ts`. `schema.prisma`
  declarado com `provider = "postgresql"`; `migration_lock.toml` travado em postgresql.
  Dev local ainda usa `DATABASE_URL=file:./dev.db` (schema estável, não rodar
  `prisma migrate dev` localmente — não tem conexão Postgres). Usar `prisma generate`
  para recriar o client sem conexão. **Unificar para Postgres localmente (Docker)**
  após o primeiro revezamento real.
- **Deploy: Render + Neon** (gratuito). Render hospeda o app Node (`render.yaml`); Neon
  (neon.tech) fornece o Postgres serverless (free tier, sem pausa). `startCommand` no
  `render.yaml` = `npx prisma migrate deploy && npm start` (migrações automáticas a cada
  deploy). Variáveis no dashboard do Render (nunca no repo): `DATABASE_URL`,
  `GS_AUTH_SECRET` (assina o JWT de sessão — ADR 0004; cai para `GS_COOKIE_SECRET` se
  ausente), `RESEND_API_KEY` + `EMAIL_FROM` (envio de e-mail real — magic link +
  notificação), `APP_URL` (URL pública, p/ montar os links absolutos dos e-mails). HTTPS
  provido pelo Render. Migração consolidada em
  `prisma/migrations/20260618000000_postgres_baseline/migration.sql`.
- **Auth: `jose`** (JWT HS256) para a sessão; e-mail via **Resend** (HTTP `fetch`, sem SDK)
  ou **modo dev** (console). Ver ADR 0004 e a seção de identidade no modelo de dados.
- **Arquivos enviados no disco**, em `storage/` (gitignored, fora de `/public`). Servidos
  por API route que faz stream dos bytes; o player carrega via `fetch` → `ArrayBuffer` →
  `api.load()` (ou `api.tex()` para AlphaTex).
- **Formatos** (`src/lib/format.ts`): Guitar Pro é o caminho principal e confiável
  (nativo do alphaTab). MusicXML é **melhor esforço** (erro claro na UI se falhar). `.mxl`
  (zipado) é **rejeitado** (falta unzip server-side — futuro).
- Código **simples e legível**; preferir o óbvio ao esperto; mudanças pequenas e
  incrementais.
- **Commits em inglês, diretos** (título curto, sem parágrafo longo explicando o
  raciocínio — isso fica na conversa/CLAUDE.md, não na mensagem de commit).

### Fallbacks de integração alphaTab + Next (se o plugin der problema)
- **Plano B**: copiar `font/` e `soundfont/` do `node_modules/@coderline/alphatab/dist`
  para `/public` e apontar `core.fontDirectory`/`player.soundFont` manualmente.
- **Plano C**: `core.useWorkers = false` → thread principal (mais lento). Hoje **não** em uso.

## 8. Modelo de dados (`prisma/schema.prisma`) — atual (M1)
- **Song**: `id`, `title`, `artist?`, `slug` (único), `createdAt`, `updatedAt`, `revisions[]`.
- **Revision**: `id`, `songId`, `number` (sequencial; "atual" = maior), `authorName`
  (stub, default "anon"), `message?`, `source` ("file" | "alphatex"), `originalName?`,
  `storedPath?`, `sizeBytes`, `alphaTex?`, `format` ("gp" | "musicxml" | "alphatex"),
  `createdAt`. Único por `[songId, number]`.
- **Histórico imutável (estilo git)**: nunca mutar/apagar uma revisão; reverter cria uma
  **nova** revisão a partir do conteúdo de uma antiga.
- **Canônico (M2, em andamento)**: no upload, além do blob de proveniência, derivamos e
  guardamos o **alphaTex canônico** no campo `Revision.alphaTex` (via `src/lib/canonical.ts`,
  com `serverExternalPackages: ["@coderline/alphatab"]` no `next.config`).
- **Grid de células (M2)** — schema migrado (`m2_cell_grid`, ADR 0002): `Track`/`Measure`
  (andaime estável; `Measure.structPrefix` = estrutura opaca + `ts`/`tempo` tipados),
  `Cell` (slot trilha×compasso), `CellContribution` (conteúdo+autor+status `accepted/
  proposed/rejected` = **a verdade**). `Revision.kind` ("import"|"snapshot"): revisão vira
  snapshot/proveniência. Cascades em todas as FKs + índices. **Tabelas vazias** até a
  **materialização** (próximo increment: transformar um import no grid de células).
- **Materialização (M2)** — `src/lib/materialize.ts` + `src/lib/alphatex-grid.ts` (lib
  compartilhada com o spike, **o mesmo código provado**, voice-aware). `POST
  /api/songs/[id]/materialize` decompõe o alphaTex canônico no grid (transação,
  idempotente). `GET /api/songs/[id]/assembled` remonta o documento **a partir das
  células** (artefato derivado). Página `/songs/[id]/compare` mostra snapshot × células
  lado a lado. **Provado no Stairway**: 2171 células; remontado === canônico (notas +
  estrutura + vozes). **Manual/direcionado** (uma música por vez); **não** ligado a todo
  upload ainda.
- **Edição por célula (M2)** — `src/lib/cells.ts`. **INVARIANTE: append-only.** Editar uma
  célula = **criar uma nova `CellContribution` + re-apontar `acceptedContributionId`**;
  nunca `update` no fragmento antigo (a antiga vira histórico → autoria por pedaço +
  "continuar de onde o outro parou" saem de graça). `POST /api/cells/[id]/contributions`
  (valida a remontagem inteira antes de aceitar — documento sempre válido; edição inválida
  é rejeitada sem gravar). `GET /api/songs/[id]/cell?track=&measure=`. UI em
  `/songs/[id]/edit` (editor de fragmento alphaTex bruto + histórico + player do remontado,
  que atualiza a cada save). `status` ∈ accepted/proposed já preparado para PR (M3).
- **Propor / aceitar / recusar (M2, PR por célula)** — `src/lib/cells.ts`. Propor =
  `addCellContribution(accept:false)` (append `proposed`, **não** re-aponta). Aceitar =
  `acceptContribution` (valida o documento + re-aponta; a antiga aceita fica no histórico).
  Recusar = `rejectContribution` (status `rejected`, nada apagado). Rotas
  `/api/cells/[id]/accept` e `/reject`. **Tela de revisão** embutida no `/edit`: clicar numa
  entrada do histórico → ver o fragmento + **pré-visualizar no player** (override via
  `GET /assembled?cell=&contribution=`) → aceitar/recusar.
- **Identidade DURÁVEL — magic link + sessão JWT (ADR 0004, 2026-07-05, aposenta o cookie
  do ADR 0003)** — `src/lib/identity.ts` + `src/lib/email.ts` + `/api/auth/*` + `/api/me`.
  O cookie-como-identidade era frágil (limpar cookie / trocar de aparelho = vira anônimo, e
  a **autoria por pedaço** — diferencial — se perde). Agora **âncora = e-mail verificado**
  (`User.email @unique`, `emailVerified`): **login passwordless por magic link** (token de
  uso único, só o **hash** guardado em `LoginToken`, TTL 30 min) → **sessão JWT** (`jose`
  HS256, exp 30d, cookie httpOnly `gs_session`). Perder o cookie **não** perde a identidade
  (reautentica pelo e-mail, mesmo `User`). Rotas: `POST /api/auth/request` ({email,name?} →
  emite+envia link; lê o cookie legado p/ **claimUserId**), `GET /api/auth/verify?token=`
  (consome → seta JWT → **redirect** `/?welcome=1` | `/?auth_error=`), `POST /api/auth/logout`.
  `getCurrentUser()` **manteve a assinatura** (lê JWT) → as 18 rotas não mudaram. **Ponte de
  migração transitória:** no verify, se o `gs_uid` legado existir, o e-mail é **anexado à
  conta existente** (não duplica) — 1ºs usuários mantêm autoria (`readLegacyCookieUserId`, o
  único resquício do cookie antigo, removível depois). **E-mail = canal de "sua vez":**
  `createNotification` também **manda e-mail** nos eventos diretos (proposta recebida/aceita/
  recusada) se o alvo tem e-mail verificado; fan-out de seguidores fica só in-app.
  **E-mail provider-agnóstico** (`src/lib/email.ts`): `RESEND_API_KEY` → Resend via `fetch`;
  sem chave → **modo dev** (loga o link + devolve `devUrl` no form). Segredos:
  `GS_AUTH_SECRET` (cai p/ `GS_COOKIE_SECRET`), `RESEND_API_KEY`/`EMAIL_FROM`, `APP_URL`
  (URL absoluta atrás de proxy) — nada obrigatório em dev.
- **Google sign-in + modal estilo ChatGPT (2026-07-10, ADR 0004 atualizada)** —
  `src/lib/google.ts` + `/api/auth/google` + `/callback` + `/api/auth/providers`.
  **Google só AUTENTICA; a âncora continua o e-mail**: magic link e Google passam pelo
  **mesmo** `resolveUserForEmail()` (extraído de `consumeLoginToken`), então entrar com
  Google num e-mail já usado **cai na mesma conta** (provado; não duplica nem sobrescreve o
  nome). OIDC **authorization code + PKCE (S256)**, `state`/`code_verifier` em cookies
  httpOnly de 10 min, `id_token` verificado contra o **JWKS do Google** (`jose`: assinatura
  + `iss` + `aud`); **`email_verified !== true` é recusado**. **Sem `next-auth`** (traria uma
  2ª noção de sessão; hand-roll de ~100 linhas casa com o nosso JWT e não mexe em
  `getCurrentUser`). Sem `GOOGLE_CLIENT_ID`/`SECRET` → `providers` devolve `{google:false}` e
  o modal **esconde o botão** (degrada para magic link). UI: `IdentityWidget` "Entrar" abre
  **`AuthModal`** (portal): Google → divisor "ou" → e-mail → "confira seu e-mail"; Esc/
  backdrop/✕ fecham; `?auth_error=` reabre o modal com a razão. Redirect URI exato:
  `${APP_URL}/api/auth/google/callback`.
  ⚠️ **Após a migração, reiniciar `next dev`** (client Prisma em memória fica velho: rotas
  que tocam `LoginToken`/`email` dão 500 até o restart). Provado ponta-a-ponta no Neon
  (signup, uso único, JWT, login de retorno sem duplicar, ponte legado, expiração, inválido).
  **Fora de escopo ainda:** senha, OAuth, revogação server-side de sessão, rate-limit,
  perfis/rename.
- **Configurações do usuário (2026-07-14)** — `src/lib/profile.ts` + `/settings` +
  `SettingsClient`. Quatro seções: (1) **Perfil** — renomear (`PATCH /api/me`). ⚠️ Renomear
  **reescreve os caches denormalizados** `CellContribution.authorName` e `Track.ownerName`
  (o link real é `authorId`/`ownerId`; os nomes só seguem) — sem isso o nome antigo ficaria
  congelado nas contribuições passadas e **uma pessoa leria como duas**, corroendo a autoria
  por pedaço, que é o diferencial. (2) **E-mail** — trocar a âncora de identidade
  (`POST /api/me/email`): emite magic link **para o endereço novo**; nada muda até ele ser
  aberto. Reusa `claimUserId` (agora "anexar e-mail a uma conta existente **in place**",
  não só a ponte do cookie legado) + `LoginToken.redirectTo` (volta pro `/settings`);
  `/api/auth/request` passou a só reivindicar conta legada **sem e-mail** (mover o e-mail de
  alguém tem que ser ato explícito, nunca efeito colateral de cookie velho). E-mail já usado
  por outra conta → 409. **Mesmo `User.id` no fim** (autoria intacta). (3) **Instrumentos que
  eu toco** (`User.instruments String[]`, chaves de `INSTRUMENT_PRESETS`) — não é enfeite: o
  mural da home marca **"precisa do seu instrumento"** e **ordena na frente** as músicas com
  trilha vazia (0%) do instrumento declarado (match por **família GM** via `presetFamily` —
  guitarra num `.gp` costuma vir program 29, não 25; `TrackCompleteness.family`). "Falta
  baixo" só vira convite quando chega em **quem toca baixo** — é a alavanca contra o risco de
  **densidade**. (4) **Minha conta** (`GET /api/me/overview`) — esperando por você / propostas
  em aberto / minhas músicas / seguindo (com deixar de seguir): o **inbox do revezamento**.
  **Preferências de reprodução** (`src/lib/player-prefs.ts`) ficam em **localStorage**, não no
  banco (descrevem um aparelho, não uma identidade): notação (só tab × partitura+tab), zoom,
  velocidade, volume, metrônomo, contagem. O `AlphaTabPlayer` lê ao montar e escuta
  `PREFS_EVENT` → aplica **na hora** (volume/velocidade são vivos; escala/pauta pedem
  `updateSettings()` + `render()`). Migração `20260714000000_user_settings`.
  **Fora de escopo (decidir depois):** preferências de **notificação** por evento/canal — hoje
  todo evento direto manda e-mail sem opt-out, e o e-mail é justamente o canal que sustenta o
  revezamento (se virar spam, morre o fio); **sair de todos os aparelhos** (exige
  `sessionVersion` no JWT) e **excluir conta** (apagar quebraria o histórico imutável — o
  caminho é anonimizar).
- **Autoridade = MODELO MAINTAINER (revisão da ADR-0003, pós-teste real)** — o **dono da
  música é o criador** (`Song.ownerId`, setado ao criar). **O dono aceita; qualquer um
  identificado PROPÕE** (PR aberto). `assertCanAccept` checa `song.ownerId` (não a trilha);
  dono null = aberto. **Reivindicar trilha FOI REMOVIDO** (`Track.ownerId` fica inerte;
  rota `/tracks/[id]/owner` deletada) — ele tornava o criador impotente na própria música,
  exatamente a dor que o João sentiu no 1º teste. **Contribuidores** = dono + todos com
  contribuição aceita (`songContributors`, `GET /api/songs/[id]/contributors`), no lugar do
  "reivindicar" (reconhecimento estilo GitHub). `CellContribution.authorId` registra autoria;
  escrever exige identidade (401 se anônimo). Honra, não trava (cookie ≠ auth). UI no `/edit`:
  dono vê "Salvar (aceito direto)"; resto vê "Propor mudança"; só o dono aceita/recusa
  propostas. **Futuro (delegação):** o dono delegar manutenção de trilha a alguém (era o
  papel da reivindicação, agora opcional e por baixo do dono).
- **Autoria por TRILHA (pós-teste real)** — `src/lib/track-content.ts`. A unidade de
  autoria virou a **trilha** ("eu faço o baixo"), não a célula — célula por célula era
  inviável (167 compassos = 167 PRs). `getTrackContent`/`submitTrackContent`: edita a
  trilha inteira como **um alphaTex** (compassos separados por `|`); ao enviar, decompõe
  em contribuições **por célula** (a granularidade de merge provada), validando o documento
  antes. Dono → aceito direto; outro → **uma** proposta de trilha. **Revisão em lote pelo
  dono**: `pendingTrackProposals` (fila agrupada por trilha+autor) + `acceptTrackProposals`/
  `rejectTrackProposals` (aceitar/recusar a trilha de um autor de uma vez). UI = `TrackEditor`
  no `/edit` (CellEditor por-célula virou legado). Mudar nº de compassos é bloqueado (operação
  estrutural separada). Rotas: `/tracks/[order]/content` (GET/POST), `/tracks/[order]/accept`,
  `/proposals`.
- **Revisão = TAB "Propostas" na página da música (2ª revisão pós-teste)** — a fila saiu
  do editor (`ProposalsPanel` em `SongTabs`, entre Colaborar e Histórico): **dono vê todas**
  (Aceitar/Recusar), **colaborador vê só as suas** ("aguardando o dono"). Expandir ("Ver
  mudanças") mostra um **diff estilo GitHub** (verde=acrescentou / vermelho=tirou,
  `src/lib/linediff.ts` — LCS puro, colapsa trechos iguais; comparação NORMALIZADA) +
  player "Ouvir como fica" (`GET /assembled?track=&author=`, proposta aplicada sem gravar,
  abre na trilha via `defaultTrackIndex`). `GET /proposals` retorna
  `{ song: {ownerId, ownerName}, proposals }`. O `/edit` é 100% editor.
- **Completude/instrumentos na aba Colaborar** — `CompletenessPanel` (antes órfão) agora
  vive dentro do `CollabPanel`: barras por trilha + "falta X" + **declarar slot** (o mural
  de incompletude por-música). Materialização é automática no upload, então não há mais
  botão "Materializar" no fluxo normal.
- **Histórico dirige o PLAYER; visível a todos, Reverter só do dono** — `HistoryPanel` sem
  player inline; "Ouvir" chama `onView(revId)` → `SongTabs` faz `setView(revId)` + vai pra
  aba Player; `PlayerPanel` mostra a barra "Tocando #N do histórico — ← Voltar ao atual".
  A tab é visível a todos (é o revezamento acontecendo); só o botão **Reverter** é gateado
  (`canRevert=isOwner`; `ownerId` vem do server → `SongTabs`).
- **Diff da proposta NA PARTITURA (killer feature)** — `ProposalsPanel`: "Ver mudanças" abre
  a **tablatura em tela cheia** (`.proposal-detail`) com as notas mudadas/novas **pintadas de
  verde** direto na partitura. `AlphaTabPlayer` ganhou `highlightBeats: string[]`
  ("measureIndex:beatIndex" voz 0) → em `scoreLoaded`, antes do `renderTracks`, seta
  `note.style`/`beat.style` com `NoteSubElement.GuitarTabFretNumber` = verde (via
  `alphaTab.model.*`). O painel calcula os beats mudados por LCS de assinaturas de beat
  (current × proposed, `parseTrackTex`). Removidos só aparecem no "−N" do cabeçalho (não
  há como mostrá-los na tablatura do PROPOSTO). Cabeçalho: `+N −M · verde = mudou`.
- **Layout das abas** — Colaborar em largura total; a completude virou **menu recolhível no
  rodapé** (`CompletenessPanel`: fechado = "X% completo", abre pra cima com % por instrumento
  em grade + declarar slot). Scrollbars escondidas (`.no-scrollbar` + viewports do player)
  mantendo o scroll.
- ⚠️ **Comparação de fragmento é NORMALIZADA** (`normalizeFragment` em track-content:
  linhas trimadas). O exporter indenta; o editor re-serializa sem indentação — comparação
  textual crua marcava TODO compasso como "mudado" (proposta de 1 nota virava 103
  compassos; aconteceu de verdade). Só conteúdo real conta como mudança.
- **Propor não recarrega o buffer** — após propor, o `TrackEditor` NÃO refaz o fetch do
  conteúdo (refazer revertia a tela para a versão aceita e a edição "sumia" — parecia que
  o botão não funcionava). `changed=0` → mensagem "sem mudanças".
- **Player mostra a verdade viva** — `SongWorkspace`: música materializada → o player
  toca o **remontado-das-células** (`/assembled`, guitarra+baixo+…), não o snapshot de
  upload. (Antes mostrava só a guitarra mesmo com baixo no grid.) Histórico toca snapshots.
- **Histórico = só o HANDOFF entre pessoas (snapshots), revisão pós-teste** — `Revision.
  kind="snapshot"` via `snapshotGrid` (`src/lib/materialize.ts`) congela o alphaTex
  remontado, credita o autor, aparece no `RevisionList` como **"mudança"** e é **tocável**
  (rota `/revisions/[id]/file`). ⚠️ **Só dispara em `acceptTrackProposals`** (proposta de
  OUTRA pessoa aceita pelo dono) — **não** mais no save direto do dono nem em
  add/remover compasso (`src/lib/measures.ts`). Motivo: compor uma música do zero é
  save-a-save e compasso-a-compasso; cada um gerando snapshot enchia o Histórico de
  "mudanças" que não eram passo de revezamento nenhum, só o dono iterando sozinho no
  próprio rascunho (aconteceu de verdade — reportado numa sessão de composição real).
  O Player "ao vivo" já sempre mostra o estado atual da grade; Histórico agora é
  puramente "quem entregou o quê pra quem", não um log de todo save. Snapshot **não** tem
  botão Reverter (a grade viva é a verdade; Reverter só nos uploads `kind="import"`).
- **Mural de incompletude (M2, item 3)** — `src/lib/tracks.ts`. **Dois tipos de
  incompletude**: (1) lacuna **dentro** da trilha (o grid já dá); (2) **trilha ausente**
  ("falta baixo"), que o grid sozinho não sabe → precisa de **instrumentação declarada**.
  `declareTrack` cria uma trilha-**slot** que **nasce vazia e sem dono** (uma célula vazia
  por compasso) — o slot vazio não-reivindicado **é o convite** (claiming + slots + mural =
  mesmo triângulo). **Métrica honesta** (`songCompleteness`): célula conta como pronta sse
  tem **contribuição aceita** (pausa transcrita conta — silêncio é música); slot vazio lê
  0%, import cheio lê 100%. Lista de presets **leve** (`INSTRUMENT_PRESETS`, não ontologia).
  Rotas `/api/songs/[id]/tracks` (declarar + presets) e `/completeness`. UI: **home = mural**
  (% + "falta X" por música) + painel por música (barras por trilha + declarar + materializar).
  Slot vazio **assembla válido** (só pausas) — verificado.
- **Ciclo assíncrono / notificações (2026-07-05) — fecha o revezamento sozinho** —
  `src/lib/notifications.ts` + modelos `Notification` e `SongWatch` (migração aditiva
  `20260705000000_notifications`). O buraco era existencial: o produto vende
  "alguém continua enquanto você não está e você volta depois", mas o dono só descobria
  uma proposta se **recarregasse a aba** — no assíncrono real (dias entre passos) a
  proposta apodrecia (o mesmo "beco sem saída" que o produto existe pra resolver).
  **Notificação in-app** (sem e-mail/push — bate com o cookie-identity; e-mail vem com
  o upgrade de magic link). Três eventos: (1) **proposta → dono** (`submitTrackContent`
  não-dono → `notifyProposalReceived` no `song.ownerId`); (2) **aceite/recusa →
  proponente** (`accept/rejectTrackProposals` → `notifyProposalReviewed`); (3) **mural**:
  **entrega** (`acceptTrackProposals` → `notifyTrackDelivered` aos seguidores) e **novo
  slot** (`declareTrack` → `notifySlotDeclared`, "agora falta baixo"). ⚠️ "Reivindicar"
  não existe mais (removido); o sinal vivo do mural é a **entrega**. `SongWatch` = **seguir**
  uma música (o lado da DEMANDA — o aprendiz que viu "falta baixo"): auto-seguir ao
  interagir (propor/declarar) + botão **"Seguir"** (`FollowButton`, ao lado do compartilhar)
  para lurkers. Fan-out exclui o próprio ator (e, na entrega, o proponente — que já recebe
  "aceita"). Tudo **best-effort**: os writers engolem o próprio erro (uma notificação nunca
  quebra o aceite/declare). Rotas: `GET /api/notifications` (+`unread`), `POST
  /notifications/read` (`{ids?}` ou todas), `GET/POST/DELETE /api/songs/[id]/watch`. UI:
  **sino** (`NotificationBell`) no header (polling 30s, badge de não-lidas, dropdown,
  clicar leva à música + aba certa via **hash** — `#propostas`/`#colaborar`, lido em
  `SongTabs`). ⚠️ **Após mudar o schema, reiniciar `npm run dev`** — o client Prisma em
  memória do dev fica velho e as rotas identificadas dão 500 até o restart (rota compila,
  mas o client antigo não tem os modelos). Verificado ponta-a-ponta no Neon (5 eventos,
  fan-out com exclusões, follow idempotente, cascade delete).
- **Editor visual de tablatura (M5, implementado)** — `src/components/TabEditor.tsx` +
  `src/lib/alphatex-editor.ts` (parser/serializer do dialeto do `AlphaTexExporter`:
  duração inline `casa.corda.dur`, gramática `nota{fxNota}.dur{fxBeat}`, UM bloco `{}`
  por nota; anotações/vozes extras/diretivas preservadas opacas). **Pegadinha**: alphaTex
  numera corda 1 = aguda; o MODELO do alphaTab numera 1 = grave (`tex = total+1−model`).
  Render do editor via `serializeForRender` (vozes transpostas + `Track.headerFragment`
  + `Measure.structPrefix`) → mesmos masterbars/ticks da música completa; `\voice` por
  compasso NÃO é alphaTex válido (cria masterbars extras — só o formato de célula usa).
  A tela `/edit` é só o editor (player headless `audioOnly` toca a música completa);
  cursor de playback sincronizado por TICK (`onTickChange`→`seekTick`); clicar num beat
  faz SEEK; o clique escolhe a corda pelo Y (geometria calibrada por NoteBounds);
  overlay de seleção (beat+corda); casas de 2 dígitos; efeitos `H P / ~ LR` + Bend
  padrão `{b (0 4)}` (bends importados ficam opacos). **Noção de compasso**: used/cap
  em 64avos com pontuado `{d}`/`{dd}`, quiáltera `{tu N}`/`{tu (N M)}`, grace `{gr}`=0
  → bloqueia estourar + badges "falta/passa X" na tablatura; durações 1..64. **Play
  toca o que se vê**: edição não salva → `POST /tracks/[order]/preview` monta o doc com
  a trilha local aplicada e recarrega o player headless. **Compassos**: dono
  adiciona/remove coluna inteira da grade (`/api/songs/[id]/measures`,
  `src/lib/measures.ts`; sem snapshot — estrutural, não é passo de revezamento; remoção
  bloqueada se o compasso carrega structPrefix). Adicionar/remover salva primeiro a edição
  pendente da trilha (nunca descarta) — compor do zero é save-a-save e compasso-a-compasso,
  e a versão antiga ("descarta suas edições não salvas") tornava isso impraticável; um
  botão "+" também aparece direto na tablatura, ao final de cada compasso. **Percussão**
  (`Track.isPercussion`) → editor próprio em GRADE (`DrumGridEditor`, bullet abaixo);
  o TabEditor nunca mais recebe `percussion=true`. POST de submissão continua igual
  (compassos por `|`; célula vazia round-tripa como "").
- **Editor de bateria em GRADE (2026-07-16)** — `src/components/DrumGridEditor.tsx` +
  `src/lib/drum-grid.ts` (lib pura, provada por round-trip em Node: groove, tercina,
  flam, acento/ghost exatos). Percussão não cabe no modelo corda×casa: a UI é um
  step-sequencer (linhas = peças do kit, colunas = subdivisões; resolução 1/4..1/32 por
  fórmula de compasso; quiáltera POR TEMPO; pincéis nota/acento/fantasma/flam). Serializa
  por compasso em alphaTex numérico — números = MIDI GM (`(36 42).16`, `{tu 3}`, `{ac}`/
  `{g}`, flam = acorde `{gr}` antes do golpe); `NAME_TO_MIDI` confere 1:1 com as
  articulações do alphaTab 1.8.3. Regras aprendidas (todas provadas empiricamente):
  - ⚠️ **Percussão NÃO renderiza com `staveProfile: "Tab"`** — alphaTab 1.8.3 quebra o
    layout ("Cannot read properties of undefined (reading 'staves')": não há pauta
    nenhuma). O `AlphaTabPlayer` aplica o perfil **POR TRILHA** (bateria → ScoreTab;
    demais → preferência da pessoa, restaurada ao trocar de trilha) e o highlight verde
    do diff pinta também `StandardNotationNoteHead/Rests`. Era o "player não mostra a
    bateria, dá um erro". **Não existe "drum tab"** no alphaTab (estilo Songsterr
    HH|x-x-|): bateria é pauta de percussão padrão, como no Guitar Pro.
  - ⚠️ **Clave de bateria = NEUTRA (‖), e o alphaTex não faz isso sozinho** — o importer
    deixa G2 mesmo com `\instrument percussion` (e o exporter escreve `\clef g2` para
    bateria!). Dois remendos: `declareTrack` põe `\clef n` no header de percussão (herda
    para todos os compassos) e o `AlphaTabPlayer` normaliza `bar.clef = Clef.Neutral`
    em toda pauta `isPercussion` no `scoreLoaded` (cobre trilhas antigas, imports e
    snapshots). Os símbolos/posições das notas já vinham certos (`staff.isPercussion`
    dirige o mapa de articulações); só a clave desenhada estava errada.
  - **Compasso não tocado re-emite o texto ORIGINAL** (`origsRef` no editor): um clique
    numa célula não reescreve a trilha inteira na notação da grade → zero ruído de
    diff/autoria (o "bug dos 103 compassos", que reapareceria aqui).
  - **Diretivas iniciais da célula (`\clef`, `\ks`, `\accidentals`…) viram prefixo
    OPACO** (`Bar.prefix`, re-emitido na serialização) — o 1º compasso de trilha
    materializada (o exporter as emite lá) abre na grade em vez de forçar texto.
  - **`\voice` (2 vozes — padrão em bateria de `.gp`) cai para modo TEXTO** com o guia
    de notação de percussão (movido do TabEditor, onde tinha virado código morto).
    Vozes paralelas não cabem no modelo da grade; limitação conhecida.
  - Baixar a resolução move golpe fora da grade (destrutivo) → `remapBeatIsLossless`
    detecta e pede confirmação; só compassos de fato alterados contam como tocados.
  - Cursor de playback: o tick do player headless vira coluna acesa na grade (mesmo
    handle `seekTick` do TabEditor; semínima alphaTab = 960 ticks → semibreve = 3840,
    o mesmo TPW da lib). Grade re-quantiza durações > resolução (mínima → semicolcheia
    + pausas) e descarta props de beat desconhecidas (`{dy f}`) — só nos compassos
    editados, pelo item do texto original.
  - **Entrada rápida (2026-07-16, benchmark FL Studio/Hydrogen/LMMS/Ableton/drumbot)**:
    **arrastar pinta** a linha inteira (estado-alvo decidido na 1ª célula, convenção
    FL — arrasto lê `barsRef`, não o state, para não perder célula entre re-renders);
    **botão direito apaga** (célula) e no **nome da peça** abre "preencher a cada
    tempo/½ tempo/célula · limpar linha" (o "Fill each 2/4/8" do FL — mata o chimbal);
    **seleção de compassos** (clique no "Compasso N", Shift estende) + **Ctrl+C/X/V/D**
    e Delete (mesmas convenções do TabEditor: clipboard de escopo de módulo — copia
    groove entre trilhas/músicas —, Ctrl+D repete adiante e move a seleção, Esc
    desfaz); **Ctrl+Z/Y undo/redo** (fotos de bars+origins+resolução — o snapshot
    INCLUI a resolução, senão desfazer um changeRes serializaria com durações
    erradas). Colar conforma cada compasso à fórmula/resolução do DESTINO
    (`conformBar`: remapeia beat a beat, tempo extra some, faltante nasce vazio;
    `cloneBar` = cópia profunda — células são Maps) e **prefixo opaco não viaja**
    com o conteúdo copiado (diretiva é posicional). Um arrasto = UM passo de undo
    (history no pointerdown).
- **Edição dinâmica no editor (2026-07-04, pós-teste de composição)** — atalhos seguem
  as convenções do nicho (pesquisa GP8/Soundslice/MuseScore/Flat/TuxGuitar):
  **pontuado** `.`/`Ctrl+.` (botões `·`/`··` na toolbar; `beatDots`/`setBeatDots` —
  ⚠️ o parser alphaTex aceita **UM** grupo `{}` de propriedades por beat, então o toggle
  mescla `d`/`dd` com as anotações opacas num grupo só, sem confundir `d` dentro de
  aspas/parênteses); **seleção de trecho** âncora↔cursor (Shift+setas / Shift+clique /
  `Ctrl+Shift+←→` por compasso, overlay `.tab-editor-sel-range`); **clipboard**
  Ctrl+C/X/V + botões (escopo de MÓDULO — sobrevive à troca de trilha e copia entre
  trilhas; colar de 1 compasso substitui a seleção/beat do cursor, de N compassos
  substitui compassos inteiros a partir do cursor); **Ctrl+D repete a seleção** logo
  adiante (o "R" do MuseScore/Flat; `r` já era pausa) — riff de compassos inteiros cai
  nos compassos seguintes; **Alt+←→ move o beat no tempo** (troca com o vizinho; na
  borda atravessa o compasso, substituindo a pausa-inteira de compasso vazio);
  **Shift+↑↓ move a nota de corda** (mesma casa, estilo TuxGuitar; bloqueia corda
  ocupada); **`+`/`−` duração** (`+` subdivide, convenção GP/Soundslice);
  **Ctrl+←→/Home/End/Ctrl+Home/End navegação**; **Ctrl+Z/Y undo/redo** (pilha de
  modelos em memória, zerada em mudança externa). Toda mutação nova respeita a regra
  de capacidade (`wouldOverflow`: só bloqueia o que AUMENTA além da fórmula). Lib
  coberta por teste manual em Node (23 casos, scratchpad). Delete numa seleção apaga
  o range; Esc desfaz a seleção.
- **Conflito de mesma célula (M3, 2026-07-16) — detectar + humano escolhe, nunca
  sobrescrever em silêncio** — `CellContribution.baseContributionId` (migração
  `20260716000000_m3_conflict_base`) grava o **merge base** estilo git: o que estava
  aceito na célula quando a contribuição foi escrita (gravado em `submitTrackContent` e
  `addCellContribution`). **Conflito** = base ≠ aceito atual **e** conteúdo normalizado
  difere (`isConflicting` em track-content; linhas legadas com base null podem dar
  falso positivo — seguro, só pede um olhar humano). `pendingTrackProposals` devolve
  `conflicts` por grupo (badge ⚡ na fila); `getProposalContent` devolve
  `conflicts: [{measureOrder, bar, current, proposed}]` (lado a lado). **Aceite exige
  escolha por compasso**: `acceptTrackProposals(..., resolutions)` (`measure.order` →
  `"current"|"proposed"`); sem escolha → `UnresolvedConflictsError` → rota devolve
  **409** com os compassos. `"current"` = a contribuição em conflito vira `rejected`
  (message "conflito — o dono manteve a versão atual"), preservada no histórico;
  tudo-"current" = vira recusa (sem snapshot). Snapshot/notificações contam só o que
  **entrou**. UI no `ProposalsPanel`: painéis lado a lado clicáveis ("na música agora"
  × "proposta de X", vermelhão = a vez do dono decidir), Aceitar desabilitado até
  resolver tudo; o proponente vê o aviso e pode reenviar a trilha (re-propor grava base
  novo e desfaz o conflito naturalmente). **Os painéis mostram TABLATURA, não texto**
  (`TabSnippet`, alphaTab render-only sem player/soundfont; `pointer-events: none` — o
  clique continua no botão do painel): o compasso vira documento renderizável pela
  mesma via do editor visual (`parseTrackTex` + `serializeForRender`, com
  `trackHeader` + `\ts`/`structPrefix` que `getProposalContent` passou a devolver —
  um compasso solto sem `\ts` explícito leria 4/4). alphaTex cru só como fallback se
  o render falhar. Sem emoji ⚡ no contador de conflitos (só "· N conflito(s)" em
  vermelhão). Re-proposta na mesma célula: a mais nova
  vence (`orderBy createdAt`). Provado ponta a ponta com 2 identidades no dev (17
  checks: detecção, 409, gate, resolução mista, recusa-total, regressão sem conflito).
- **Excluir música (2026-07-17) — só o dono, confirmação estilo GitHub** —
  `DELETE /api/songs/[id]` exige `{confirmTitle}` idêntico ao título (o servidor
  re-valida; o clique nunca basta) e `ownerId === me` — música **sem dono**
  (seed/legado) ninguém exclui (não há quem responda pelo trabalho coletivo).
  O delete limpa `Cell.acceptedContributionId` antes do `song.delete` na mesma
  transação (a FK é NoAction — cascade puro poderia tropeçar no meio) + apaga
  `storage/<songId>` legado (best-effort). UI: botão "Excluir" discreto no
  `breadcrumb-actions` (`DeleteSongButton`, só o dono vê) → modal (casca do
  auth-modal) com input que precisa do título exato para liberar o botão
  vermelho. Provado ponta a ponta no dev (401/403/400/200/404 + zero órfãos).
- **Auto-materialização no upload (feito)** — o POST `/revisions` deriva o canônico e,
  se a música **ainda não tem grade**, materializa na hora; upload que não converte ou
  não monta a grade é **barrado** (422, revisão desfeita). Re-upload em música JÁ
  materializada só vira revisão (nunca re-materializa — apagaria o revezamento).
  Músicas sem dono (`ownerId null`, seeds/legado) = **abertas**: qualquer identificado
  salva direto (badge "música aberta (sem dono) — salva direto").
- **Efeitos + bend com distância + afinação/andamento (2026-07-27)** —
  (1) `NoteEffect` ganhou `x` (nota morta — o "X" da tab), `pm`, `nh`, `ac`, `hac`,
  `st`, `g` (todos sem parâmetro; o exporter emite exatamente esses tokens, provado no
  1.8.3). ⚠️ `extractEffectsAndSuffix` virou **ciente de tokens**: exporter e nosso
  serializer escrevem TODOS os efeitos num grupo único (`{v pm x}`) — classificar
  grupo a grupo perdia o estado dos toggles e duplicava efeitos ao reeditar; tokens
  não reconhecidos são re-unidos num grupo opaco (guarda `PARAM_KEYWORDS` p/ args de
  `slur`/`acc`/`lf`/`rf`). (2) **Bend por distância** (`noteBendQuarters`/`setBend`
  substituem o toggle): valor em QUARTOS de tom (2=½, 4=full, 6=1½ — botões ½/1/1½ na
  toolbar; clicar de novo remove). ⚠️ O exporter reescreve nosso `b (0 N)` como
  `be (bend 0 0 60 N)` — o leitor reconhece essa forma como a mesma distância (senão
  todo bend virava "custom" após save+materialização); curva real multi-ponto = "B*"
  (custom), substituível mas não decomposto. (3) **Afinação da trilha** e **andamento**
  = operações ESTRUTURAIS do dono (`src/lib/structure.ts`, validam o documento inteiro
  remontado via `assembleSongAlphaTex(…, transform)` antes de persistir): rotas POST
  `/tracks/[order]/tuning` ({tuning: tokens aguda→grave, mesmo nº de cordas — casas
  ficam, altura muda}) e `/api/songs/[id]/tempo` ({bpm}, escreve `\tempo` no header
  global e limpa o do compasso 1; automações de tempo no meio ficam). Helpers puros de
  afinação em `src/lib/tuning.ts` (client-safe: presets Drop D/Eb/DADGAD…, nomes
  canônicos em bemol como o alphaTab). ⚠️ Dois formatos de `\tuning` no header:
  declareTrack (`\tuning E4 B3…`) e exporter (`\tuning (Eb4…) { label "…" }` —
  multi-linha; a reescrita remove o bloco de label junto). UI no `TrackEditor`
  (dono): popover de afinação (preset ou corda a corda, grid 3 colunas) + pill
  "♩= bpm" (`.tempo-ctl`/`.tempo-input`, sem spinners); mudança estrutural salva
  a edição pendente antes (nunca descarta) e remonta o editor (`structEpoch` na
  key). `getTrackContent` devolve `track.tuning` e `song.tempo`. Refinos
  2026-07-28: **afinação desenhada na tablatura estilo Songsterr** — letras por
  corda à esquerda do 1º compasso (overlay `.tab-editor-tuning-label`, posicionado
  por `stringGeometry`; o texto "Guitar Standard Tuning" do alphaTab é desligado
  via `notation.elements: new Map([[NotationElement.GuitarTuning, false]])`).
  **Andamento no MEIO da música**: `setMeasureTempo` (structure.ts) escreve/remove
  `\tempo N` no structPrefix do compasso (rota `/tempo` aceita `{bpm, measure}`;
  bpm null remove; compasso 1 delega pro inicial e não pode ficar sem); UI =
  botão "♩=" no grupo Comp. da toolbar do TabEditor (popover "a partir do
  compasso N", Aplicar/Remover; botão aceso = compasso tem mudança) **+ as
  próprias marcas ♩=N na partitura são CLICÁVEIS** (overlay
  `.tab-editor-tempo-mark`, dono) — clicou, abre o popover daquele compasso.
  **Andamento é OTIMISTA e leve (revisão pós-feedback: "travadinha")**: o
  `applyTempoAt` atualiza o estado local na hora e NÃO recarrega a trilha nem
  remonta o editor (tempo não toca células → sem dirty-save/loadTrack); o
  TabEditor re-renderiza **em-place** quando header/meta/tempo mudam (effect de
  assinatura estrutural → `api.tex()`, mantém cursor e histórico — `structEpoch`
  na key foi removido); só o player headless recarrega (áudio novo). Widget da
  barra = botão compacto "♩ N" com popover (padrão do de afinação).
  ⚠️ `serializeForRender` ganhou `initialTempo` (o tempo inicial vive no header
  GLOBAL, não no da trilha — sem injetar, o editor não desenhava a marca do
  compasso 1); metadado global exige o terminador `.` na linha seguinte. **Presets**:
  Violão (aço) GM 25 e Violão (náilon) GM 24; "Guitarra" corrigida 25→27 (limpa —
  soava violão de aço; trilhas já declaradas guardam o próprio `\instrument`).
  ⚠️ `declareTrack` escapa o label no regex de numeração ("Violão (aço)" tem
  metacaracteres).
- **Endurecimento pós-code-review (2026-07-29, branch `refactor/code-review-fixes`, 7
  commits)** — auditoria de tech lead aplicada em etapas:
  (1) **Código morto removido** (−1072 linhas): CellEditor + as 4 rotas por-célula
  (`/api/cells/*`, `/songs/[id]/cell`), a rota manual `/materialize` (era DESTRUTIVA e
  sem auth — re-materializava a grade viva apagando autoria), RevisionList, Contributors,
  NewSongForm/Toggle, SongWorkspace, caminho `percussion` do TabEditor, exports/CSS órfãos.
  `cells.ts` ficou só com `Actor` + `songContributors`. `materializeSongGrid` agora RECUSA
  música que já tem grade (defesa em profundidade).
  (2) **Autorização**: regra do dono consolidada em `src/lib/authority.ts`
  (`assertSongOwner`/`loadOwnedSong`, `NotOwnerError` → 403); revert/upload/scaffold =
  ato de dono (401/403; autor vem da SESSÃO, não de campo livre); declarar trilha exige
  identidade; propostas com visibilidade no SERVIDOR (dono vê tudo; autor vê as suas —
  inclusive no preview `/assembled?track=&author=`); upload com cap de 10 MB; segredo de
  sessão OBRIGATÓRIO em produção (`identity.ts` lança no 1º uso; cookie legado ignorado
  em prod sem `GS_COOKIE_SECRET`).
  (3) **E-mail**: rate limit em memória (`src/lib/ratelimit.ts`) no magic link (3/15min
  por e-mail, 10/15min por IP) e na troca de e-mail; HTML de notificação escapa
  displayName (injeção); token de login consumido ATOMICAMENTE (updateMany condicional);
  purga de LoginToken expirado a cada emissão.
  (4) **Escrita atômica**: `submitTrackContent` grava tudo numa transação; numeração de
  revisão via `createNumberedRevision` (`src/lib/revisions.ts`, retry em P2002); snapshot
  pós-aceite é best-effort (aceite já commitado nunca vira 500); re-propostas na mesma
  célula: só a mais nova entra (antigas viram rejected/superseded, não "accepted" falso).
  (5) **Parsing**: `splitBars()` em alphatex-editor — `|` separa compasso só FORA de
  aspas/chaves/parênteses (um `|` em lyrics de `.gp` desalinhava a contagem e travava a
  trilha) — adotado por parseTrackTex/submit/preview/DrumGrid; tokenizadores cientes de
  aspas; `BeatDuration` aceita 128 (era descartada em silêncio); drum-grid acha o `)` do
  acorde por profundidade (`{tu (3 2)}` parseava errado). **Testes: `npm test`**
  (`tests/alphatex-parsing.test.ts`, node:test via tsx — 11 casos).
  (6) **UI**: trocar de trilha (dropdown ou +trilha) SALVA a edição pendente antes
  (nunca descarta — mesmo princípio das operações estruturais); `loadTrack` e
  ProposalsPanel com erro visível + guard de corrida (seq ref invalida resposta velha);
  saves de Configurações/Boas-vindas com try/finally (não travam mais em "Salvando…");
  1º upload mantém o player na grade viva (não abre o snapshot).
  (7) **Dados**: `Revision.authorId` (migração `20260729000000_revision_author`; rename
  reescreve também `Revision.authorName` — Histórico não congela mais nome antigo);
  `songCompleteness` em 2 `groupBy` (era 2 counts POR trilha — N+1 no mural);
  `.env.example` corrigido para o Postgres do Docker.
- ⚠️ **Limites atuais**: vozes 1+ são opacas (edita-se a voz 0); percussão sem editor
  visual; add/remover compasso é só do dono (estrutural-como-proposta precisa de design
  próprio: compassos têm IDENTIDADE por id, não por índice — insert+delete ≠ edição);
  mudar o Nº de cordas de uma trilha não existe (afinação exige mesmo nº de cordas).

## 9. Estrutura
```
src/
  app/
    page.tsx                                  # lista de músicas + nova música
    songs/[songId]/page.tsx                   # player + upload + histórico
    api/
      songs/route.ts                          # GET lista, POST cria
      songs/[songId]/revisions/route.ts       # GET lista, POST upload
      revisions/[id]/file/route.ts            # GET bytes (ou AlphaTex)
      revisions/[id]/revert/route.ts          # POST reverter (nova revisão a partir de uma antiga)
  components/
    AlphaTabPlayer.tsx   NewSongForm.tsx   SongWorkspace.tsx
    UploadForm.tsx       RevisionList.tsx
  lib/  prisma.ts  format.ts  storage.ts  slug.ts  instruments.ts
prisma/  schema.prisma  seed.ts
storage/  # uploads (gitignored)
```

## 10. Como rodar

### Dev local (Postgres em Docker — desde 2026-07; SQLite aposentado)
```
npm install                                   # use --use-system-ca se houver TLS corp.
# ⚠️ ABRIR O DOCKER DESKTOP primeiro (sem o engine, nada sobe) e então:
docker compose up -d                          # attacca-dev-db (host 55432; dados no volume attacca_pgdata)
# .env: DATABASE_URL="postgresql://attacca:attacca@localhost:55432/attacca_dev"
npm run dev                                    # http://localhost:4000  (webpack)
```
> "Can't reach database server at localhost:55432" = Docker Desktop fechado (o
> container tem restart: unless-stopped — sobe sozinho quando o engine liga).
> Porta 55432 no host de propósito: 5432/5433 já têm Postgres nativos nesta máquina.
> Nota TLS corporativo: se algo falhar com `UNABLE_TO_VERIFY_LEAF_SIGNATURE`, rode com
> `NODE_OPTIONS=--use-system-ca` (Node usa o trust store do Windows).

### Deploy (Render + Neon — gratuito)
1. Criar conta em **neon.tech** → novo projeto → banco (o existente chama `gitsong`,
   criado antes do rebranding — renomear é opcional) → copiar `DATABASE_URL`
2. Criar conta em **render.com** → New Web Service → conectar o repo (ainda `GitSong`
   no GitHub até o João renomear; `render.yaml` já diz `name: attacca`)
3. No Render, Environment: `DATABASE_URL` (URL Neon) + `GS_COOKIE_SECRET` (string aleatória)
   - PowerShell para gerar o secret:
     `[Convert]::ToBase64String([System.Security.Cryptography.RandomNumberGenerator]::GetBytes(32))`
4. Deploy automático roda `npm install && npm run build`, depois
   `npx prisma migrate deploy && npm start`
5. Verificar logs → URL pública do Render compartilhável

## 11. Já implementado (M1)
- Upload → render/play → **histórico de revisões** (ver/tocar qualquer uma).
- **Player estilo Songsterr**: dropdown de **uma trilha por vez** (abre na 1ª),
  tablatura, tema escuro, maior; **barra de transporte** (seek + tempo atual/total) e
  **cursor** visível na tablatura.
- **Reverter**: `POST /api/revisions/[id]/revert` cria uma nova revisão a partir de uma
  antiga (copia AlphaTex ou os bytes), "Revertido para #N", histórico imutável; botão na
  `RevisionList` (escondido na revisão atual).
- **Rótulo de instrumento por trilha** (`lib/instruments.ts`): família GM (Guitarra,
  Baixo, Bateria/Percussão…) via `playbackInfo.program`/canal de percussão.
- *Caveat*: com `staveProfile: "Tab"`, trilhas sem corda (ex.: piano) podem aparecer
  vazias. Aceitável no foco atual (instrumentos de corda).

## 12. Posicionamento e copyright (stubs por enquanto, mas decidir cedo)
- Transcrição de música protegida é obra derivada. Estratégia: modelo **reativo** (estilo
  DMCA — tirar quando o detentor reclamar) **+ foco em zona segura**: domínio público,
  Creative Commons e bandas independentes/nicho que **querem** ser transcritas.
- Colaboração dentro de **grupo/comunidade** é bem menos exposta que publicação aberta.
  Essa escolha de nicho limpo deve **guiar o produto**, não ser deixada para o fim.
- Tratar login/pagamento/licenciamento/takedown como **stubs**, anotados como futuros.

## 13. Roadmap
- **M1 (este)**: upload → render/play → histórico de revisões. ✅
- **M2**: colaboração por trilha dentro de uma comunidade — **exige primeiro o formato
  canônico (seção 5)**. Criar música, convidar pessoas, **reivindicar trilhas**; botão
  "propor correção" (pull request) em trilha alheia; merge fácil (trilhas diferentes) +
  propostas por célula; **mural de incompletude** (% de conclusão, "falta baixo/bateria"). ✅
- **M3**: resolução de **conflito de mesma-célula** (flag + escolha humana). ✅
  (2026-07-16 — ver "Conflito de mesma célula" na seção 8.)
- **Futuro**: camada pública (começando por domínio público/CC), reputação por
  comunidade, busca; auth real, takedown, licenciamento, pagamento; editor de tab no
  navegador.

### ⚠️ Transição crítica: mecanismo → primeiro revezamento real (não esquecer)
Tudo que existe hoje (formato canônico, grid, materialização, edição/PR por célula,
reivindicação) é **mecanismo**, provado **solo no Stairway**. A tese central — o
**revezamento** e a **densidade** — **continua não testada com gente** (precisa de uma 2ª
pessoa). Foi certo adiar auth/deploy enquanto o núcleo técnico assustador estava sem prova;
agora:
- **Reivindicar trilha (2) e mural de incompletude (3) são os ÚLTIMOS incrementos de
  mecanismo** antes do contato humano.
- O **mural de incompletude (3)** está **mais perto do diferencial e da resposta ao risco
  de densidade** que a reivindicação — é o que puxa a 2ª pessoa ("falta baixo, isso eu
  faço"). **Não é sobremesa do (2); para o teste com gente, pode importar mais.**
- O **próximo marco depois de (2)+(3) NÃO é código**: é o **primeiro revezamento real**
  (duas pessoas completam uma música juntas). Isso força as duas coisas adiadas —
  **identidade "real o suficiente"** e **deploy compartilhável** — que têm **lead time**.
  Colocar no radar **agora** para o M2 não virar "catedral de mecanismo sem usuário" (o
  modo de falha do Parture, no topo deste arquivo).

### Itens/limitações conhecidos do M1
- Autor é texto livre (sem login).
- `.mxl` rejeitado (falta unzip server-side).
- Revisão = blob de arquivo inteiro (não versionável por trilha — resolvido no M2 via seção 5).
