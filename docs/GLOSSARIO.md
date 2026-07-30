# Glossário do attacca

> Vocabulário do projeto, extraído de [`CLAUDE.md`](../CLAUDE.md), [`CONTEXTO.md`](../CONTEXTO.md),
> [`README.md`](../README.md) e das ADRs em [`docs/adr/`](adr/). Serve para alinhar a
> linguagem: muitos termos aqui têm significado **específico** neste projeto (ex.: "célula",
> "materializar", "snapshot", "slot") e usá-los solto gera confusão de design.
> Ordem: do produto para o código.

---

## 1. Produto e tese

- **attacca** — nome do produto (sempre minúsculo). Termo musical: emendar no próximo
  movimento **sem pausa**. Chamava-se **GitSong** até 2026-07-15.
- **Revezamento** — o conceito central: uma pessoa começa uma transcrição, outra **continua
  de onde a primeira parou**, de forma **assíncrona**, cada uma no seu instrumento, com
  autoria de cada pedaço preservada. Oposto de **sobrescrita**.
- **Passagem de bastão / relay** — sinônimos de revezamento; "o bastão passou" = o critério
  de sucesso do primeiro teste com gente real (ADR 0003).
- **Incompletude como convite** — princípio de produto: uma transcrição incompleta não é
  beco sem saída, é um chamado à ação ("falta baixo → isso eu faço").
- **Diferencial estrutural** — transcrição **divisível por trilha + assíncrona + autoria
  preservada + incompletude visível**. Não é wiki convergente (Songsterr/UG), não é edição
  síncrona (Flat/Noteflight), não é autoria solo (Guitar Pro/MuseScore).
- **Duas pontas** — **aprendizes = demanda** (querem tocar) e **transcritores = oferta**
  (poucos). Como a unidade é divisível, um aprendiz vira **micro-contribuidor** (contribui
  só o riff que aprendeu), religando as duas pontas.
- **Densidade (risco nº 1)** — revezamento só funciona com gente suficiente na **mesma**
  música. Estratégia: densidade **por nicho**, não cobertura ampla.
- **Princípio guia** — "pequeno, nichado, **provado de ponta a ponta**". Cada decisão de
  arquitetura sai de spike com arquivo real, não de suposição.
- **Parture** — projeto de 2020 do João com a mesma ideia, que mirou alto demais
  (blockchain, "toda música já gravada") e nunca lançou. Serve como **modo de falha
  nomeado**: "catedral de mecanismo sem usuário".
- **Mecanismo × tese** — "mecanismo" é o que o código faz (grade, materialização, PR);
  "tese" é o revezamento acontecer com gente. Provar mecanismo **não** prova a tese.
- **Coached × self-serve** — contribuição **assistida** (alguém ao lado traduzindo) versus
  a pessoa contribuindo **sozinha**. São incógnitas distintas e em camadas: mecanismo →
  self-serve → revezamento orgânico/densidade.
- **Degrau do alphaTex** — o obstáculo real identificado na ADR 0003: pedir que um músico
  escreva notação em **texto** à mão. Motivou o editor visual (M5).
- **Zona segura (copyright)** — domínio público, Creative Commons e bandas de nicho que
  **querem** ser transcritas; modelo reativo estilo DMCA. Escolha de nicho que guia o
  produto, não detalhe do fim.

## 2. Marca e design

- **Slogan** — "Alguém começa. Você continua."
- **Vermelhão (#E5432B)** — a cor de **"a sua vez"** / a lacuna. Usada com parcimônia: o
  que falta, CTAs de continuar, tab ativa, cursor do player.
- **Cor = significado** — tinta = pronto; vermelhão = sua vez; cinza = ainda não começou.
- **blockbar** — a **assinatura visual**: barra de progresso em blocos (`██████░░░░`) com a
  "borda viva" em vermelhão. Classe `.blockbar` em `globals.css`.
- **Wordmark** — o nome em Space Grotesk, sem símbolo elaborado (o tratamento especial do
  último "a" foi **rejeitado**).
- **Tema** — **dark é o default** (carvão); claro é opcional via `[data-theme="light"]`
  (`src/lib/theme.ts`, localStorage `attacca:theme`). Os players alphaTab **não herdam CSS**:
  as cores da tablatura vêm de `alphaTabResources(readTheme())`.
- **Voz/microcopy** — minúscula, direta; o botão diz o que acontece ("Continuar →",
  "falta: Baixo", "ninguém começou — seja a primeira mão").
- **A home é o produto** — a página inicial É o mural, não uma landing de SaaS.

## 3. Formato e representação musical

- **alphaTab** — biblioteca (LGPL, `@coderline/alphatab`) que importa Guitar Pro/MusicXML,
  renderiza tablatura/partitura e toca com soundfont. Usada **só como dependência npm**
  (nunca vendorizada/modificada).
- **alphaTex** — o formato de notação **em texto** do alphaTab e o **formato canônico
  interno** do attacca (ADR 0001): diffável, ~70× menor que o JSON do alphaTab, e
  round-trip provado no Stairway (100% das notas/efeitos; só normaliza rests redundantes).
- **Canônico** — o alphaTex derivado no upload e guardado em `Revision.alphaTex`
  (`src/lib/canonical.ts`). Passa **sempre** pelo importador/exportador oficiais.
- **Proveniência** — o blob original do upload (`.gp`/MusicXML), guardado como
  `Revision.blob` (Bytes no banco). É **read-only**; não é versionável nem editável.
- **Fallback de alta fidelidade** — o JSON do `JsonConverter` do alphaTab: 100% lossless,
  mas 22,5 MB e não-diffável. Registrado como plano B, **não** é fonte de verdade.
- **MusicXML** — aceito como **entrada** ("melhor esforço"), **descartado** como formato
  canônico (o alphaTab não exporta). `.mxl` (zipado) é rejeitado (falta unzip server-side).
- **Stairway** — a transcrição real de "Stairway to Heaven" (13 trilhas / 167 compassos /
  19.786 notas) usada como caso de prova de todos os spikes. Artefatos gitignored.
- **Fragmento** — pedaço de alphaTex correspondente a **uma célula** (um compasso de uma
  trilha, com todas as vozes).
- **Prefixo opaco** — trecho de alphaTex que **round-tripa sem ser modelado**
  (`Song.headerFragment` global, `Track.headerFragment`, `Measure.structPrefix`,
  `Bar.prefix` da grade de bateria). Evita enumerar toda a estrutura em colunas.
- **Família GM** — família do General MIDI derivada de `playbackInfo.program`/canal de
  percussão (`src/lib/instruments.ts`): Guitarra, Baixo, Bateria… Importa porque guitarra
  num `.gp` costuma vir program 29, não 25 — o match do perfil é por **família**, não
  por programa exato.
- **staveProfile** — configuração do alphaTab que escolhe o que desenhar (`Tab`,
  `ScoreTab`…). Aplicado **por trilha**: percussão precisa de `ScoreTab` (com `Tab` puro o
  alphaTab 1.8.3 quebra o layout); as demais seguem a preferência da pessoa.
- **Multi-bar rest** — compassos consecutivos só de pausa colapsados em um, com o número em
  cima (nativo do alphaTab 1.8; ligado no `AlphaTabPlayer`, não no editor).

## 4. Modelo de dados — a grade

- **Grade `(trilha × compasso)`** — o modelo mental central: linhas = trilhas,
  colunas = compassos. Aproxima o problema de "planilha colaborativa" em vez de "merge de
  texto" (ADR 0002).
- **Célula** — a **unidade atômica de edição**: um compasso inteiro de **uma** trilha, com
  **todas as vozes juntas**. Modelo `Cell`. Limitação consciente: duas pessoas não dividem
  vozes diferentes da mesma trilha no mesmo compasso.
- **Andaime × preenchimento** — `Track` e `Measure` são o **andaime estável** (identidade
  por `id`, não por índice, para a autoria não escorregar quando a numeração muda);
  `Cell`/`CellContribution` são o preenchimento.
- **`Song`** — a música (`title`, `artist?`, `slug`, `ownerId`, `headerFragment` global).
- **`Track`** — a trilha (`order`, `name`, `headerFragment`, `tuning`, `instrument`,
  `isPercussion`). `ownerId` existe mas está **inerte** (reivindicação foi removida).
- **`Measure`** — o compasso como andaime **compartilhado**: `ts` e `tempo` **tipados** (a
  UI lê para desenhar) + `structPrefix` opaco (seção, repetições, casas alternativas,
  jumps, armadura).
- **`Cell`** — o slot `(trackId, measureId)` + `acceptedContributionId` (o ponteiro para o
  que está valendo).
- **`CellContribution`** — **a verdade**: conteúdo (`alphaTex`) + autor (`authorId` +
  `authorName` denormalizado) + `status` (`accepted` | `proposed` | `rejected`) +
  `baseContributionId` (o merge base).
- **`Revision`** — **snapshot/proveniência** imutável, numerada por música
  (`kind: "import" | "snapshot"`).
- **Append-only (invariante)** — editar uma célula **nunca** faz `update` no fragmento
  antigo: cria uma **nova** `CellContribution` e re-aponta `acceptedContributionId`. É daí
  que saem de graça a autoria por pedaço e o "continuar de onde o outro parou".
- **Regra anti-drift** — existe **um** lugar editável (as células). `Revision.alphaTex` e o
  blob são derivados/proveniência, nunca uma segunda cópia editável.
- **Histórico imutável (estilo git)** — nunca mutar/apagar uma revisão; reverter cria uma
  **nova** revisão a partir do conteúdo de uma antiga.
- **Materializar** — decompor o alphaTex canônico de um import na grade de células
  (`src/lib/materialize.ts` + `src/lib/alphatex-grid.ts`). Automático no upload; **recusa**
  música que já tem grade (re-materializar apagaria o revezamento).
- **Remontado / assembled** — o documento alphaTex montado **a partir das células**
  (`assembleSongAlphaTex`, `GET /api/songs/[id]/assembled`). É um **artefato derivado**, e é
  o que o Player toca ao vivo (não o snapshot de upload).
- **Snapshot** — `Revision` com `kind="snapshot"`: congela o remontado, credita o autor e
  aparece no Histórico como "mudança". **Só dispara quando o dono aceita a proposta de
  outra pessoa** — nem no save direto do dono nem em add/remover compasso (senão o
  Histórico viraria log de todo save, não de passos de revezamento).
- **Slot** — trilha declarada que **nasce vazia e sem dono** (`declareTrack`): uma célula
  vazia por compasso. O slot vazio **é o convite** ("falta baixo").
- **Completude honesta** — métrica de `songCompleteness`: a célula conta como pronta **sse
  tem contribuição aceita**. Pausa transcrita conta (silêncio é música); slot vazio lê 0%,
  import cheio lê 100%.
- **Mural de incompletude** — a visão de "o que falta" (home e painel por música). Trata os
  **dois tipos** de incompletude: lacuna **dentro** da trilha (a grade sabe) e **trilha
  ausente** (só a instrumentação declarada sabe).

## 5. Autoridade e fluxo de colaboração

- **Modelo maintainer** — o **dono da música é o criador** (`Song.ownerId`). **O dono
  aceita; qualquer pessoa identificada PROPÕE.** `assertCanAccept`/`assertSongOwner` em
  `src/lib/authority.ts`.
- **Música aberta** — `ownerId` null (seed/legado): qualquer identificado salva direto. Não
  pode ser excluída (não há quem responda pelo trabalho coletivo).
- **Reivindicar trilha** — mecanismo **removido**. Tornava o criador impotente na própria
  música (dor real do 1º teste). Delegação por trilha fica como futuro, por baixo do dono.
- **Contribuidores** — dono + todas as pessoas com contribuição aceita
  (`songContributors`), no lugar do reivindicar — reconhecimento estilo GitHub.
- **Autoria por trilha** — a unidade de **autoria** é a trilha ("eu faço o baixo"), embora a
  unidade de **merge** siga sendo a célula. Editar = um alphaTex da trilha inteira
  (compassos separados por `|`), decomposto em contribuições por célula no envio
  (`src/lib/track-content.ts`). Célula por célula era inviável: 167 compassos = 167 PRs.
- **Proposta (PR)** — `addCellContribution(accept:false)`/`submitTrackContent` de quem não é
  dono: append com status `proposed`, **sem** re-apontar o aceito. Uma proposta **por
  trilha**, revisada **em lote** (`pendingTrackProposals`, `acceptTrackProposals`,
  `rejectTrackProposals`).
- **Aba Propostas** — a fila de revisão, na página da música: **dono vê todas** (Aceitar/
  Recusar), **colaborador vê só as suas**. Visibilidade imposta **no servidor**.
- **Diff na partitura** — o "killer feature": "Ver mudanças" abre a tablatura em tela cheia
  com as notas mudadas/novas **pintadas de verde** (via `highlightBeats` no `AlphaTabPlayer`;
  beats mudados calculados por LCS de assinaturas). Removidos só aparecem no "−N".
- **Comparação normalizada** — `normalizeFragment`: a comparação de fragmentos trima as
  linhas. Sem isso, o exportador (que indenta) versus o editor (que não) marcava **todo**
  compasso como mudado — uma proposta de 1 nota virava 103 compassos (aconteceu).
- **Merge base** — `CellContribution.baseContributionId`: o que estava aceito na célula
  quando a contribuição foi escrita. É o merge base **estilo git**.
- **Conflito de mesma célula** — base ≠ aceito atual **e** conteúdo normalizado difere
  (`isConflicting`). Nunca se sobrescreve em silêncio: a fila mostra os compassos **lado a
  lado em tablatura** (`TabSnippet`) e **o aceite exige escolha por compasso**
  (`resolutions`: `"current"` | `"proposed"`); sem escolha → **409**
  (`UnresolvedConflictsError`). Tudo-"current" degenera em recusa (sem snapshot).
- **Operação estrutural** — mudança que não é "preencher célula": adicionar/remover
  compasso (`src/lib/measures.ts`), afinação da trilha, andamento (`src/lib/structure.ts`).
  É **ato do dono**, valida o documento inteiro remontado antes de persistir, e **não** gera
  snapshot. Sempre salva a edição pendente antes (nunca descarta trabalho).
- **Seguir (watch)** — `SongWatch`: o lado da **demanda** (o aprendiz que viu "falta
  baixo"). Auto-seguir ao interagir + botão explícito para lurkers.
- **Notificação** — `Notification` + `src/lib/notifications.ts`. Fecha o ciclo assíncrono
  (sem isso, a proposta apodrecia até o dono recarregar a aba). Eventos: proposta recebida,
  proposta aceita/recusada, entrega e novo slot (fan-out aos seguidores, excluindo o ator).
  Tudo **best-effort**: uma notificação nunca quebra o aceite. UI = sino no header.
- **"Sua vez"** — o canal de retomada: eventos **diretos** também saem por **e-mail**; o
  fan-out de seguidores fica só in-app (evita tempestade).

## 6. Editores

- **`TabEditor`** — editor visual de tablatura (M5) sobre `src/lib/alphatex-editor.ts`
  (parser/serializer puro do dialeto do exportador). Cursor de playback sincronizado por
  **tick**, seleção de trecho, clipboard de escopo de módulo, undo/redo, atalhos seguindo as
  convenções do nicho (GP8/Soundslice/MuseScore/TuxGuitar).
- **`DrumGridEditor`** — editor de **percussão** em grade (step-sequencer: linhas = peças do
  kit, colunas = subdivisões), sobre `src/lib/drum-grid.ts`. Percussão não cabe no modelo
  corda×casa. Serializa em alphaTex numérico (números = MIDI GM).
- **Noção de compasso** — o editor conta o **used/cap** em 64avos (com pontuado, quiáltera e
  grace = 0): bloqueia estourar a fórmula e mostra badges "falta/passa X".
- **Preview / "play toca o que se vê"** — `POST /tracks/[order]/preview` monta o documento
  com a trilha **local** (não salva) e recarrega o player headless, para ouvir a edição
  pendente.
- **Player headless** — instância do alphaTab em modo `audioOnly` que toca a música completa
  enquanto o editor desenha a trilha.
- **Compasso não tocado re-emite o texto original** — regra dos dois editores (`origsRef`):
  um clique numa célula não reescreve a trilha inteira na notação do editor → zero ruído de
  diff/autoria (é a mesma raiz do "bug dos 103 compassos").
- **Pegadinha das cordas** — o alphaTex numera corda 1 = **aguda**; o **modelo** do alphaTab
  numera 1 = **grave**: `tex = total + 1 − model`.
- **`splitBars()`** — divisor de compassos ciente de contexto: `|` só separa compasso
  **fora** de aspas/chaves/parênteses (um `|` em lyrics de `.gp` desalinhava a contagem e
  travava a trilha).
- **Limites atuais** — vozes 1+ são **opacas** (edita-se a voz 0); duas vozes em percussão
  cai para modo texto; mudar o **nº de cordas** de uma trilha não existe.

## 7. Identidade

- **Âncora de identidade** — o **e-mail verificado** (`User.email`), não o cookie. Perder o
  cookie não perde a autoria (ADR 0004).
- **Magic link** — login passwordless: e-mail → link de **uso único** (só o **hash** em
  `LoginToken`, TTL 30 min, consumido atomicamente) → sessão.
- **Sessão JWT** — `jose` HS256, exp 30 dias, cookie httpOnly `gs_session`. Segredo
  `GS_AUTH_SECRET` (obrigatório em produção).
- **`resolveUserForEmail()`** — o **único** lugar onde um e-mail verificado vira `User`.
  Por isso entrar com Google num e-mail que já usou magic link **cai na mesma conta**.
- **Google sign-in** — OIDC authorization code + **PKCE (S256)**, `id_token` verificado
  contra o JWKS do Google; `email_verified !== true` é **recusado**. Google só **autentica**;
  a âncora continua o e-mail. Sem `next-auth` (traria uma 2ª noção de sessão).
- **Ponte de migração / `claimUserId`** — anexar um e-mail a uma conta **existente** in
  place (originalmente para o cookie legado `gs_uid`; hoje também para trocar de e-mail em
  Configurações). Preserva a autoria dos primeiros usuários.
- **Cache denormalizado de nome** — `CellContribution.authorName`, `Track.ownerName`,
  `Revision.authorName`. O link real é o `id`; renomear **reescreve** os caches — sem isso o
  nome antigo congelaria e **uma pessoa leria como duas**, corroendo o diferencial.
- **`User.instruments`** — instrumentos que a pessoa toca (chaves de `INSTRUMENT_PRESETS`).
  Não é enfeite: o mural marca "precisa do seu instrumento" e **ordena na frente** as
  músicas com slot vazio daquele instrumento (match por família GM). "Falta baixo" só vira
  convite quando chega em quem toca baixo — é a alavanca contra a **densidade**.
- **Preferências de reprodução** — notação, zoom, velocidade, volume, metrônomo, contagem.
  Ficam em **localStorage** (`src/lib/player-prefs.ts`), não no banco: descrevem um
  **aparelho**, não uma identidade.
- **`DeclareSpec` / `INSTRUMENT_FAMILIES`** — declaração de trilha em 2 passos estilo
  Songsterr: primeiro a família, depois as características (timbre GM, nº de cordas) →
  `resolveInstrument` deriva programa + afinação + rótulo. A lista plana
  `INSTRUMENT_PRESETS` continua sendo a moeda do **perfil**.

## 8. Stack, infra e convenções

- **Next 16 em modo webpack** — `next dev/build --webpack`: o plugin oficial do alphaTab é
  de **webpack**, não Turbopack (o default do Next 16).
- **`serverExternalPackages`** — deixa o alphaTab rodar **no servidor** (import/export do
  modelo, sem DOM) para derivar canônico e validar remontagem.
- **Prisma 6 (não 7)** — o 7 exigiria `prisma.config.ts` + driver adapter; peso
  desnecessário. Cliente via singleton em `src/lib/prisma.ts`.
- **Dev = Postgres em Docker** — `docker compose up -d` → `attacca-dev-db` na porta host
  **55432** (5432/5433 já têm Postgres nativos na máquina). SQLite aposentado.
- **Deploy = Render + Neon** — app Node persistente (`render.yaml`, `startCommand` roda
  `prisma migrate deploy` a cada deploy) + Postgres serverless no Neon. Sem serverless, sem
  object storage.
- **Env vars não renomeadas** — `GS_AUTH_SECRET`, `GS_COOKIE_SECRET`, cookies `gs_session`/
  `gs_uid`: renomear quebraria sessões e o deploy (resquício do nome GitSong, de propósito).
- **⚠️ Reiniciar o `next dev` após migração** — o client Prisma em memória fica velho e as
  rotas que tocam modelos novos dão 500 até o restart.
- **⚠️ TLS corporativo** — `UNABLE_TO_VERIFY_LEAF_SIGNATURE` → rodar com
  `NODE_OPTIONS=--use-system-ca`.
- **`npm test`** — `node:test` via tsx: `tests/alphatex-parsing.test.ts` e
  `tests/instrument-presets.test.ts`.
- **Spike** — experimento **descartável** em `spikes/` que produz a evidência de uma ADR
  (round-trip, decompor/remontar, verificação de materialização). Artefatos gitignored.
- **ADR** — Architecture Decision Record em `docs/adr/`: 0001 formato canônico,
  0002 modelo de células, 0003 primeiro revezamento real, 0004 identidade durável.
- **`CLAUDE.md` × `CONTEXTO.md`** — o primeiro guarda a memória **técnica** (stack, modelo
  de dados, decisões, convenções); o segundo, a **narrativa** (log de sessões e handoff).
- **Convenções de código** — simples e legível, o óbvio antes do esperto, mudanças pequenas
  e incrementais; **commits em inglês e diretos** (o raciocínio vive nos docs, não na
  mensagem de commit); interface 100% PT-BR.

## 9. Milestones

- **M1** ✅ — upload → render/play → histórico de revisões.
- **M2** ✅ — colaboração por trilha: formato canônico, grade, materialização, edição/PR,
  mural de incompletude.
- **M3** ✅ — conflito de mesma célula (detectar + humano escolhe).
- **M5** ✅ — editor visual de tablatura (e o editor de bateria em grade).
- **Futuro** — camada pública (domínio público/CC), reputação, busca, takedown,
  licenciamento; delegação de trilha; preferências de notificação; granularidade por voz.
- **Próximo marco (não é código)** — **densidade e self-serve**: gente contribuindo sozinha,
  na mesma música.
