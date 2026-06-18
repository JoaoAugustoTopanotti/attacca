# GitSong — memória do projeto

> Memória do projeto entre sessões: **o que** construímos, **por quê**, e **quais
> decisões de arquitetura** destravam o futuro. Mantenha atualizado conforme o projeto
> evolui. (O `CONTEXTO.md` é o complemento narrativo — log de sessões e handoff.)

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
- **Prisma 6 + SQLite** (`prisma/dev.db`). Prisma 6 de propósito: o 7 exige
  `prisma.config.ts` + driver adapter, peso desnecessário para o M1. Cliente de
  `@prisma/client` via singleton em `src/lib/prisma.ts`.
- **Arquivos enviados no disco**, em `storage/` (gitignored, fora de `/public`). Servidos
  por API route que faz stream dos bytes; o player carrega via `fetch` → `ArrayBuffer` →
  `api.load()` (ou `api.tex()` para AlphaTex).
- **Formatos** (`src/lib/format.ts`): Guitar Pro é o caminho principal e confiável
  (nativo do alphaTab). MusicXML é **melhor esforço** (erro claro na UI se falhar). `.mxl`
  (zipado) é **rejeitado** (falta unzip server-side — futuro).
- Código **simples e legível**; preferir o óbvio ao esperto; mudanças pequenas e
  incrementais.

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
- **Identidade leve (ADR 0003)** — `src/lib/identity.ts` + `/api/me`. Pessoa = **cookie
  assinado** (HMAC, `GS_COOKIE_SECRET`) → `User` (`displayName`). `getCurrentUser()` lê o
  cookie. Widget no header (prompt "quem é você?" / "você é X"). **Não é auth** (sem senha/
  e-mail); identidade por-navegador. Upgrade = magic link.
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
- **Player mostra a verdade viva** — `SongWorkspace`: música materializada → o player
  toca o **remontado-das-células** (`/assembled`, guitarra+baixo+…), não o snapshot de
  upload. (Antes mostrava só a guitarra mesmo com baixo no grid.) Histórico ainda toca
  snapshots antigos.
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
- ⚠️ **Limite atual**: editor é de fragmento alphaTex **bruto** (editor visual de tab = M5);
  auto-materializar no upload é o "último parafuso", depois do loop maduro.

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
```
npm install                                   # use --use-system-ca se houver TLS corp.
npx prisma migrate dev --name init            # cria o SQLite + client (idempotente)
npm run db:seed                               # música demo tocável (AlphaTex)
npm run dev                                    # http://localhost:4000  (webpack)
```
> Nota TLS corporativo: se algo falhar com `UNABLE_TO_VERIFY_LEAF_SIGNATURE`, rode com
> `NODE_OPTIONS=--use-system-ca` (Node usa o trust store do Windows).

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
  propostas por célula; **mural de incompletude** (% de conclusão, "falta baixo/bateria").
- **M3**: resolução de **conflito de mesma-célula** (flag + escolha humana). Raro, por
  isso vem depois.
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
