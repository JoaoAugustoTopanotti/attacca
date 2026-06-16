# GitSong — Contexto das conversas (handoff)

> Resumo vivo da colaboração entre o João e o Claude. Serve para **retomar o fio**
> numa nova conversa sem perder contexto. O `CLAUDE.md` guarda a parte técnica
> (stack, modelo de dados, convenções); **este arquivo guarda a narrativa, as
> decisões e o que vem a seguir.** Atualizar ao fim de cada sessão.

---

## Em uma frase
GitSong é um "GitHub para tablatura": transcrições musicais colaborativas, onde
várias pessoas completam uma música por instrumento/trilha, com histórico de versões
e um player estilo Songsterr (notação/tab + playback com cursor).

## Estado atual (2026-06-07)
**Milestone 1 entregue e rodando localmente.** O app:
- Lista músicas e cria música nova. ✅
- Recebe upload de Guitar Pro / MusicXML, cada upload vira uma **revisão**. ✅
- Renderiza e toca com **alphaTab** (notação/tab, trilhas, play/pause/parar). ✅
- Mostra histórico de revisões; dá pra ver/tocar qualquer revisão anterior. ✅
- Vem com uma **música demo tocável** (AlphaTex) via seed. ✅

Validado pelo João no navegador: criar música OK, importar "Stairway to Heaven"
(baixado do Songsterr) OK, **a música tocou**.

## Decisões importantes (e por quê)
1. **Next.js 16 + modo webpack** (`next dev/build --webpack`): o Next 16 usa Turbopack
   por padrão, mas o plugin oficial do alphaTab é de webpack. Por isso forçamos webpack.
2. **Prisma 6 (não 7)**: o 7 exige `prisma.config.ts` + driver adapter (better-sqlite3),
   peso desnecessário pro M1. Downgrade consciente para simplicidade.
3. **alphaTab como dependência npm pura** (LGPL limpo); plugin copia fonte/soundfont
   para `public/`, servidos em `/font` e `/soundfont`.
4. **Autor das revisões = texto livre (stub)**, sem login (vem depois).
5. **Histórico imutável (estilo git)**: nunca mutar/apagar revisão. "Reverter" (ainda
   não implementado) criará uma **nova** revisão a partir de uma antiga.
6. **Formatos**: Guitar Pro é o caminho confiável; MusicXML é "melhor esforço" (erro
   claro na UI se falhar); **`.mxl` rejeitado** (falta unzip server-side).
7. **Banco**: SQLite local em `prisma/dev.db`. Sem servidor/senha. Para inspecionar:
   `npx prisma studio`.
8. **Rede corporativa/TLS**: instalar com `NODE_OPTIONS=--use-system-ca` quando der
   `UNABLE_TO_VERIFY_LEAF_SIGNATURE`.

## Feedback do João nos testes
- **Visual feio** → em andamento (player redesenhado; falta polir o resto da página). 
- **Partitura "confusa" / não dá pra saber qual instrumento** → **resolvido**: dropdown
  de instrumento (uma trilha por vez) + etiqueta de família GM.
- **"O player não existe" / não sei que parte está tocando** → **resolvido**: barra de
  transporte (progresso/seek + tempo atual/total) + cursor visível na tablatura.
- **Todas as trilhas selecionadas ao abrir / partitura pequena / clave de sol** →
  **resolvido**: abre só a 1ª trilha, `scale` maior, `staveProfile: "Tab"` (tablatura),
  tema escuro. Referência visual: Songsterr.
- **Erro de hidratação** (data) → corrigido; o restante era a extensão Bitdefender.
- **Caveat**: com `staveProfile: "Tab"`, trilhas sem corda (ex.: piano) podem aparecer
  vazias (não têm tablatura). Aceitável no foco atual (instrumentos de corda).

## Visão (resumo — detalhe completo no CLAUDE.md)
Em 2026-06-07 o João trouxe o contexto completo do produto. Pontos-chave:
- **Dor:** músicos aprendizes querem tocar juntos, mas não há onde montar **em conjunto**
  uma transcrição completa e fiel, cada um no seu instrumento.
- **Diferencial:** transcrição **divisível por trilha + assíncrona + autoria preservada +
  incompletude visível** (revezamento, não sobrescrita). Nem wiki, nem edição síncrona,
  nem autoria solo.
- **Princípio guia:** pequeno, nichado, provado ponta a ponta (o Parture morreu de
  ambição). Densidade por nicho é o risco nº 1.

## Roadmap (do CLAUDE.md)
- **M1** — upload → render/play → histórico. ✅
- **M2** — colaboração por trilha numa comunidade (reivindicar trilha, propor correção
  estilo PR, mural de incompletude). **Exige primeiro o formato canônico** (abaixo).
- **M3** — resolução de conflito de mesma-célula (flag + escolha humana).
- **Futuro** — camada pública (domínio público/CC), reputação, busca, auth/takedown/
  pagamento, editor de tab.

### Decisão de arquitetura — formato canônico interno ✅ DECIDIDO (2026-06-07)
Spike B concluído. **Formato canônico = `alphaTex`** (texto do alphaTab). Evidência de
round-trip num `.gp` real (Stairway): alphaTab importa/exporta alphaTex sem código
próprio, é **texto** (diffável), ~70× menor que o JSON do alphaTab e preserva 100% das
notas/efeitos (só normaliza rests redundantes). JSON (`JsonConverter`) = fallback de alta
fidelidade; **MusicXML descartado** (alphaTab não exporta). Registro completo em
**`docs/adr/0001-formato-canonico.md`**. Unidade atômica do merge segue sendo a célula
`(trilha, compasso)`; merge por união de trilhas + PR por célula + conflito raro resolvido
por humano (M3). **Não implementado** — só decidido.

## Pendências de curto prazo
- [x] Barra de transporte/posição no player. ✅ (2026-06-07)
- [x] Rótulo de instrumento por trilha (família GM). ✅ (2026-06-07)
- [x] Botão "Reverter" (cria nova revisão a partir de uma antiga). ✅ (2026-06-07)
- [x] Player estilo Songsterr: dropdown de 1 trilha, tablatura, tema escuro, maior. ✅ (2026-06-07)
- [ ] Polish do restante da página (header, cards de música, formulários).
- [ ] (Verificar no navegador) cursor visível, seek, reverter e o novo player escuro/tab.
- [ ] Decidir início do M2 (modelo de "completar por instrumento").

## Log de sessões
- **2026-06-16** — Sessão 1 (identidade por cookie — 1º passo do marco): instrumento do
  amigo = **corda** (zero código no player), começar por **identidade**. Construído: `User`
  + cookie assinado (HMAC, `GS_COOKIE_SECRET`), `getCurrentUser`, `/api/me`, widget no
  header. Gate trocado de **string → `userId`** (`Track.ownerId`; `assertCanAccept` por id);
  claim/release/aceitar/recusar resolvem identidade server-side (401 se anônimo); propor
  aberto a qualquer identificado; `CellContribution.authorId`. CellEditor usa a identidade
  (sem campo de nome). Migration `identity` (aditiva). **Testado com 2 cookies**: Joao
  reivindica → Maria não aceita (400) mas propõe (201); Joao (dono) aceita (200); anônimo
  401. Gotcha: dev server tinha **Prisma client velho em memória** → 500 em `/api/me`;
  **reiniciei o server**. Próximo do checklist: banco (Postgres/Turso) + blob no DB + deploy.
- **2026-06-16** — Sessão 1 (marco: 1º revezamento real — DESIGN): mecanismo do M2 dado
  como concluído. João pediu para **desenhar o marco antes de tocar infra**. Escrita a
  **ADR-0003** (`docs/adr/0003-primeiro-revezamento-real.md`): (1) **identidade leve por
  cookie** (nome→User→cookie assinado; gate passa de match-de-string para match-de-userId
  — a "mudança pequena" prevista; magic link como upgrade); (2) **deploy enxuto**:
  Render/Railway (Node, `next start` do build webpack) + Postgres gerenciado (Neon/Render),
  **blob como Bytes no DB** (adia object storage — a verdade viva já está no DB), **sem
  serverless**; (3) **UX do relay** A→B (compartilhar link, prompt de identidade, claim/
  editar como a identidade). Critério de sucesso: 2 pessoas, 1 música, bastão passa numa
  instância deployada. **Aguardando aprovação da ADR antes de qualquer infra.**
- **2026-06-15** — Sessão 1 (M2 mural de incompletude): a pausa de 30s do João virou
  modelagem. **Dois tipos de incompletude**: lacuna na trilha (grid dá) vs **trilha
  ausente** ("falta baixo" — precisa de **instrumentação declarada**). `declareTrack` cria
  trilha-slot que **nasce vazia e sem dono** (o convite); **métrica honesta** = célula com
  contribuição aceita (pausa conta; não "nota vs pausa"). Presets leves (sem ontologia).
  UI: home vira **mural** (% + "falta X"), painel por música (barras + declarar +
  materializar). Provado no seed (guitarra+baixo → declarar bateria → 67%, "falta
  Bateria"); **slot vazio assembla válido** (só pausas). Aprendido: o formato alphaTex com
  `.` é sensível — para dados de teste, usar alphaTex que comprovadamente parseia (seed) ou
  o exportador, não escrever à mão. **(2)+(3) = fim do mecanismo**; próximo marco é o 1º
  revezamento real (identidade + deploy, lead time). Mural está mais perto do diferencial.
- **2026-06-16** — Sessão 1 (ADR-0003 revisada pós-feedback): João aprovou, com correções
  que **mudam o que o teste mede**: (1) **o degrau real é o alphaTex bruto**, não a infra —
  um músico de verdade escrever alphaTex à mão é o que quebra; saídas (a) amigo aprende, (b)
  template de editor (NÃO contribuição pré-semeada, senão o mural mente), (c) **coached/
  emparelhado (recomendado)**; **coached ≠ self-serve** (incógnita posterior). (2) **catch
  do `staveProfile`**: trilha sem corda (bateria/teclado) renderiza vazia no modo Tab →
  casar instrumento que falta com o player (corda = zero código) ou relaxar antes. (3)
  **honestidade do banco**: Postgres casa com disco efêmero de Render/Railway (não é
  "escala"); alt zero-migração = Fly/Turso+SQLite; escolher pela que termina a semana. (4)
  critério de sucesso suavizado (prova mecanismo com gente real, não densidade/self-serve).
  **Pré-build (entrada do João): qual amigo + qual música PD/CC + instrumento que falta** —
  decide instrumento-alvo e `staveProfile`. Sem infra antes disso.
- **2026-06-15** — Sessão 1 (M2 reivindicar trilha): **portão social, não trava** (como o
  João pediu). `setTrackOwner` (claim/release), trilhas **começam sem dono**; sem dono →
  qualquer um aceita, com dono → só o nome que bate aceita (`assertCanAccept`), **propor
  segue aberto**. UI no `/edit` (reivindicar/liberar + botões de aceitar gateados). Testado:
  claim → maria não aceita (400) mas propõe (201); joao aceita (200); release → aberto.
  Honra/convenção (troca string→userId quando houver auth). Corrigido: materialização passa
  a deixar trilhas **sem dono** (era pré-claim do uploader). **Moldura estratégica
  registrada no CLAUDE (seção Roadmap)**: (2)+(3) são os últimos incrementos de mecanismo;
  o próximo marco é o **1º revezamento real com 2 pessoas** (não-código), que força
  identidade + deploy (lead time — radar agora). O **mural (3)** pode importar mais que a
  reivindicação para puxar a 2ª pessoa. Evitar a "catedral de mecanismo sem usuário".
- **2026-06-12** — Sessão 1 (M2 PR por célula): propor/aceitar/recusar com **comparação de
  versões embutida** como tela de revisão (a costura que o João pediu). Propor = append
  `proposed` sem re-apontar; revisar = clicar no histórico → ver fragmento + pré-ver no
  player (override `GET /assembled?cell=&contribution=`) → aceitar (valida + re-aponta) ou
  recusar (status `rejected`, fica no histórico). Testado no Stairway: propor não move
  ponteiro, preview 200, aceitar re-aponta, recusar não apaga, append-only mantido.
  **Abertura temporária consciente**: qualquer um aceita até existir reivindicação de
  trilha (item 2). **Warning de hidratação**: investigado (grep) — sem fonte no código
  (datas determinísticas; random/Date só em rotas server); é a extensão Bitdefender, some
  em janela anônima; o badge caiu 2→1 com o fix de data. Próximo: (2) reivindicar trilha.
- **2026-06-12** — Sessão 1 (M2 edição por célula): João validou a comparação visual
  (esquerda == direita). Construída a edição com o invariante **append-only** plantado
  desde o início (`src/lib/cells.ts`): editar = nova `CellContribution` + re-apontar
  `acceptedContributionId`, nunca sobrescrever. `POST /api/cells/[id]/contributions`
  valida a remontagem inteira antes de aceitar (documento sempre válido). UI `/songs/[id]/
  edit` (fragmento bruto + histórico + player do remontado que atualiza a cada save).
  Testado no Stairway: edição válida → append + repoint + assembled 200; edição inválida →
  400 sem gravar; antiga sempre preservada. **Auto-materializar no upload fica para o fim**
  (decisão do João: só tem valor depois da edição; mantém risco controlado). Próximo: PR
  por célula (propor/aceitar) usa o `status` já existente.
- **2026-06-12** — Sessão 1 (M2 materialização): com os 4 cuidados do João. (1) Lógica
  decompor/remontar extraída para **`src/lib/alphatex-grid.ts`** — spike e serviço chamam
  o MESMO código; achado importante: trilhas multi-voz (`\voice`) precisavam ser
  decompostas por voice-run e **transpostas** na remontagem (a célula guarda todas as
  vozes do compasso). (2) `materializeSongGrid` idempotente em transação. (3) **Critério
  de aceite**: `assembleSongAlphaTex` remonta das células e `spikes/verify-materialize.ts`
  confirma === canônico (notas + estrutura + vozes idênticas) no Stairway (2171 células).
  (4) Stairway-only, manual (`POST /materialize`), não ligado a uploads. Página
  `/songs/[id]/compare` para a verificação visual (snapshot × células). Migration extra
  `add_song_header` (cabeçalho global opaco). **Falta o João conferir visualmente.**
- **2026-06-12** — Sessão 1 (M2 migration): rodada a migration aditiva `m2_cell_grid` com
  os 3 cuidados pedidos: (1) `Measure` da ADR (`structPrefix` opaco + só `ts`/`tempo`
  tipados, sem section/repeatStart/repeatCount herdados); (2) `onDelete: Cascade` em todas
  as FKs (Song→Track/Measure/Cell, Cell→CellContribution; `acceptedContribution`=NoAction
  pra evitar ciclo); (3) índices em Cell.songId/trackId/measureId e CellContribution.cellId.
  + `Revision.kind`. SQL puramente aditivo (o "DROP Revision" é o redefine seguro do SQLite,
  com INSERT…SELECT). Dados intactos (3 músicas, 2 revisões, kind=import). Tabelas novas
  vazias. `tsc` limpo. **Materialização = próximo increment** (e teste visual de ouro:
  remontar o Stairway das células e conferir que renderiza idêntico).
- **2026-06-12** — Sessão 1 (M2 schema, de-risk estrutural): a pedido do João, o critério
  do spike foi reforçado para **fidelidade estrutural** (não só notas). `spikes/assemble.mjs`
  + `spikes/struct.mjs`: (A) formato alphaTex é estruturalmente lossless; (B) decompor→
  remontar com célula=fragmento completo é lossless; (C) **o schema recomendado** (structPrefix
  opaco compartilhado na Measure + notas por célula) também é lossless — tudo no caso
  controlado rico em estrutura E no Stairway real. Achados: fatiar por marcador de masterbar
  é frágil → fatiar por `|`; barra-dupla `isDoubleBar` é flag derivado (perda ilusória).
  Escrita a **ADR-0002** (modelo Track/Measure/Cell/CellContribution; Revision=snapshot;
  proposto/aceito; limitação consciente: célula = compasso inteiro da trilha, sem dividir
  vozes). **Migration ainda NÃO executada** (próximo passo, aguardando OK).
- **2026-06-07** — Sessão 1 (M2 início, de-risk): **prova do fatiamento por célula**
  (`spikes/cellslice.mjs`) — slice `(trilha, compasso)` → swap → re-emit alphaTex válido,
  via modelo do alphaTab (`bar.voices` + `score.finish()`) e exportador oficial. PART 1
  (exemplo controlado) e PART 2 (Stairway real, 13×167) **passaram**: célula trocada
  recebe o conteúdo novo, demais células intactas, re-importa válido. Depois, incremento
  de **storage**: upload passa a guardar o **alphaTex canônico** (`src/lib/canonical.ts` +
  `serverExternalPackages`) junto do blob; Stairway existente backfillado; teste HTTP real
  ok (323.773 chars). **Schema de células ainda NÃO modelado** (próximo passo).

### Log antigo
- **2026-06-07** — Sessão 1: planejamento aprovado; M1 construído ponta a ponta
  (Next 16 + alphaTab + Prisma 6 + SQLite); seed AlphaTex tocável; smoke test
  server-side OK. João testou no navegador (criar música, importar Stairway, tocou).
  Corrigido erro de hidratação (data). Criados `CLAUDE.md` e este `CONTEXTO.md`.
- **2026-06-07** — Sessão 1 (cont.): adicionada **barra de transporte** ao player
  (`AlphaTabPlayer.tsx`): tempo atual/total + slider de seek clicável/arrastável,
  ligada aos eventos `playerPositionChanged` / setter `timePosition` do alphaTab.
  Build OK. Falta o João validar visualmente (seek + cursor) no navegador.
- **2026-06-07** — Sessão 1 (cont. 2): dois ajustes a partir do teste do João:
  - **Cursor da tablatura invisível** → faltava o CSS do cursor do alphaTab.
    Adicionado `.at-cursor-bar/.at-cursor-beat/.at-highlight/.at-selection` em
    `globals.css` (o alphaTab injeta os elementos mas não os estiliza).
  - **Erro de hidratação persistente** → causado pela **extensão Bitdefender**
    (atributos `bis_skin_checked`/`bis_register`/`__processed_*`), não pelo código.
    Posto `suppressHydrationWarning` em `<html>`/`<body>`; confirmação definitiva é
    abrir em janela anônima (sem extensão).
- **2026-06-07** — Sessão 1 (Passo A): fechado o essencial do M1.
  - **Reverter** (`/api/revisions/[id]/revert` + botão na `RevisionList`): cria uma
    NOVA revisão a partir de uma antiga (copia AlphaTex ou os bytes do arquivo),
    histórico imutável; botão escondido na revisão atual; pede confirmação.
  - **Rótulo de instrumento por trilha** (`lib/instruments.ts`): família GM
    (Guitarra, Baixo, Bateria/Percussão…) ao lado do nome da trilha.
  - `tsc --noEmit` limpo; rota de revert responde 405 em GET (compila).
  - Commits desta sessão: `feat: add player transport bar and playback cursor`,
    `fix: prevent hydration mismatches from dates and browser extensions`,
    `feat: add revision revert and per-track instrument labels`,
    `docs: update project memory for revert and instrument labels`.
- **2026-06-07** — Sessão 1 (player redesign): a pedido do João, player aproximado do
  Songsterr — **dropdown de instrumento (1 trilha por vez)** no lugar dos checkboxes,
  abre só a 1ª trilha, **`staveProfile: "Tab"`** (tablatura, sem clave de sol),
  **tema escuro** (cores claras via `display.resources`), `scale` maior, viewport mais
  alto e layout mais largo. `tsc` limpo, páginas 200.
- **2026-06-07** — Sessão 1 (visão): João trouxe o contexto completo do produto.
  **`CLAUDE.md` reescrito** integrando dor, diferencial, modelo de duas pontas, risco de
  densidade, posicionamento/copyright e — o mais importante — a **decisão arquitetural do
  formato canônico interno (grade trilha × compasso)** como pré-requisito do M2. Antiga
  dúvida "(a) arquivo inteiro vs (b) trilhas de 1ª classe" agora **resolvida a favor de
  (b) estruturado**.
- **2026-06-07** — Sessão 1 (Spike B — formato canônico): experimento de round-trip num
  `.gp` real (Stairway, 13 trilhas/167 compassos/19.786 notas) com `spikes/roundtrip.mjs`
  rodando alphaTab em Node. Comparados MusicXML (sem exportador — descartado), JSON
  (`JsonConverter`, 100% lossless mas 22,5 MB e não-diffável) e **alphaTex** (324 KB,
  texto, 100% das notas/efeitos, só normaliza rests). **Decisão: alphaTex.** ADR escrita
  em `docs/adr/0001-formato-canonico.md`; CLAUDE.md atualizado. Nada implementado (spike
  descartável; artefatos gerados são gitignored).
