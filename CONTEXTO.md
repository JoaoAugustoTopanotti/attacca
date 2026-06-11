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

## Feedback do João nos testes (a tratar depois)
- **Visual feio** → estilização fica para uma etapa de polish. (ciente)
- **Partitura "confusa" / não dá pra saber qual instrumento toca** → melhorar
  apresentação das trilhas (nomes/instrumentos, talvez uma trilha por vez).
- **"O player não existe" / não sei que parte está tocando** → falta uma **barra de
  transporte** (progresso/seek + tempo atual/total + posição). É o gap funcional mais
  sentido. → vira o próximo passo proposto.
- **Erro de hidratação** (data formatada divergindo server/cliente) → **corrigido**
  em 2026-06-07 (formatação determinística em `RevisionList.tsx`).

## Roadmap (do CLAUDE.md)
- **M1** — upload → render/play → histórico. ✅ (faltam polimentos do player)
- **M2** — fork/branch/merge + "completar em conjunto" por trilha/instrumento.
- **M3** — propor correções / diff de versões.
- **M4** — auth real, takedown, licenciamento, pagamento.
- **M5** — editor de tab no navegador.

### Decisão de design em aberto (resolver no M2)
"Revisão = um arquivo inteiro" (bom pro M1). No M2, escolher entre **(a)** manter
arquivo multi-trilha completo por revisão (simples, sem merge) ou **(b)** trilhas como
entidades de primeira classe (modelo git "de verdade", mais trabalhoso).

## Pendências de curto prazo
- [x] Barra de transporte/posição no player. ✅ (2026-06-07)
- [ ] Melhorar exibição de trilhas/instrumentos (nome do instrumento, talvez tocar/ver uma por vez).
- [ ] Botão "Reverter" (cria nova revisão a partir de uma antiga).
- [ ] Polish visual geral.
- [ ] (Verificar no navegador) seek arrastando funciona e cursor/auto-scroll visível.

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
