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
