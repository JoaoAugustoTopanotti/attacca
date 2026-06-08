# GitSong — memória do projeto

> Este arquivo é a memória do projeto entre sessões. Mantenha-o atualizado conforme
> o projeto evolui (modelo de dados, convenções, decisões, roadmap).

## Visão do produto
Plataforma web colaborativa de transcrições musicais — pensa "GitHub para tablatura".
O diferencial central é **completar transcrições em conjunto**: uma pessoa começa uma
música, outras terminam, dividindo o trabalho por instrumento/trilha (um faz a guitarra,
outro o baixo, outro a bateria), com histórico de versões e possibilidade de propor
correções. O player é estilo Songsterr: notação/tab multi-instrumento com playback
sincronizado e um cursor andando sobre as notas.

## Escopo do Milestone 1 (este — fatia fina, ponta a ponta)
Um app que roda localmente e faz **só** isto:
1. Lista de músicas + criar música; cada música tem sua página.
2. Upload de Guitar Pro (`.gp/.gp3/.gp4/.gp5/.gpx`) ou MusicXML (`.xml/.musicxml`).
3. Render + playback no navegador com **alphaTab**: notação/tab, trilhas selecionáveis,
   play/pause/parar e cursor sincronizado.
4. Cada upload vira uma **revisão**. A página mostra o histórico e deixa ver/tocar
   qualquer revisão anterior.

### Fora de escopo agora (não construir)
- Editor de tab no navegador (alphaTab é renderizador/player; edição vem depois).
- Login robusto, pagamento, licenciamento, takedown (hoje: stub — autor é texto livre).
- Fork/branch/merge e a camada de "completar em conjunto" (próximo milestone).

## Stack e convenções
- **Next.js 16 (App Router) + TypeScript + React 19.**
- **alphaTab** (`@coderline/alphatab`) + plugin oficial `@coderline/alphatab-webpack`.
  - **LGPL**: usado só como dependência npm; **não** vendorizar/modificar o código dele.
  - O plugin é de **webpack**, então dev/build rodam com `--webpack`
    (ver `package.json`), e **não** com o Turbopack padrão do Next 16.
  - O plugin empacota Web Worker + Audio Worklet e copia os assets (fonte Bravura e
    soundfont SONiVOX). Em `next.config.mjs` setamos `assetOutputDir: public/`, então
    o Next serve os assets em `/font/` e `/soundfont/` (ambos gitignored, são gerados).
  - O componente do player (`src/components/AlphaTabPlayer.tsx`) é `"use client"` e
    importa o alphaTab **dinamicamente dentro do `useEffect`** (nunca no topo), para
    não executar no SSR.
  - Settings usados: `core.fontDirectory = "/font/"`,
    `player.soundFont = "/soundfont/sonivox.sf2"`, `enablePlayer`, `enableCursor`.
- **Prisma 6 + SQLite** (`prisma/dev.db`). Usamos Prisma 6 de propósito: o Prisma 7
  exige `prisma.config.ts` + driver adapter, peso desnecessário para o M1. Cliente
  importado de `@prisma/client` via singleton em `src/lib/prisma.ts`.
- **Arquivos enviados no disco**, em `storage/` (gitignored, fora de `/public`).
  Servidos por API route que faz stream dos bytes; o player carrega via
  `fetch` → `ArrayBuffer` → `api.load()` (ou `api.tex()` para AlphaTex).
- **Formatos** (`src/lib/format.ts`): Guitar Pro é o caminho principal e confiável
  (nativo do alphaTab). MusicXML é **melhor esforço** — aceito, mas se renderizar com
  problema o player mostra erro claro em vez de quebrar. `.mxl` (MusicXML zipado) é
  **rejeitado** com mensagem clara (alphaTab não descompacta o container; unzip no
  servidor fica como melhoria futura).

### Fallbacks de integração alphaTab + Next (se o plugin der problema)
- **Plano B**: copiar `font/` e `soundfont/` de `node_modules/@coderline/alphatab/dist`
  para `/public` via script e apontar `core.fontDirectory`/`player.soundFont` manualmente.
- **Plano C (último escape)**: `core.useWorkers = false` → roda na thread principal
  (mais lento, mas funciona). Hoje **não** estamos nesse modo.

## Modelo de dados (`prisma/schema.prisma`)
- **Song**: `id`, `title`, `artist?`, `slug` (único), `createdAt`, `updatedAt`,
  `revisions[]`.
- **Revision**: `id`, `songId`, `number` (sequencial por música; "atual" = maior número),
  `authorName` (stub, default "anon"), `message?`, `source` ("file" | "alphatex"),
  `originalName?`, `storedPath?`, `sizeBytes`, `alphaTex?`, `format`
  ("gp" | "musicxml" | "alphatex"), `createdAt`. Único por `[songId, number]`.
- **Histórico imutável (estilo git)**: nunca mutar/apagar uma revisão. Reverter (quando
  existir) cria uma **nova** revisão a partir do conteúdo de uma antiga.

## Estrutura
```
src/
  app/
    page.tsx                                  # lista de músicas + nova música
    songs/[songId]/page.tsx                   # player + upload + histórico
    api/
      songs/route.ts                          # GET lista, POST cria
      songs/[songId]/revisions/route.ts       # GET lista, POST upload
      revisions/[id]/file/route.ts            # GET bytes (ou AlphaTex)
  components/
    AlphaTabPlayer.tsx   NewSongForm.tsx   SongWorkspace.tsx
    UploadForm.tsx       RevisionList.tsx
  lib/  prisma.ts  format.ts  storage.ts  slug.ts
prisma/  schema.prisma  seed.ts
storage/  # uploads (gitignored)
```

## Como rodar
```
npm install                                   # use --use-system-ca se houver TLS corp.
npx prisma migrate dev --name init            # cria o SQLite + client (idempotente)
npm run db:seed                               # música demo tocável (AlphaTex)
npm run dev                                    # http://localhost:3000  (webpack)
```
> Nota TLS corporativo: se `npm install` falhar com `UNABLE_TO_VERIFY_LEAF_SIGNATURE`,
> rode com `NODE_OPTIONS=--use-system-ca` (Node usa o trust store do Windows).

## Roadmap
- **M1 (este)**: upload → render/play → histórico de revisões. ✅
- **M2**: fork/branch/merge + "completar em conjunto" por trilha/instrumento.
- **M3**: propor correções / diff de versões.
- **M4**: auth real, takedown, licenciamento, pagamento (hoje: stub).
- **M5**: editor de tab no navegador.

### Decisão de design EM ABERTO (resolver no M2 — não construir agora)
Hoje **"revisão = um arquivo inteiro"**, o que está certo para o M1. Ao implementar
"completar por instrumento" no M2, escolher entre:
- **(a)** manter "cada revisão é um arquivo multi-trilha completo": quem adiciona um
  instrumento baixa o atual, edita num editor externo e sobe de novo (simples, sem merge);
  ou
- **(b)** tornar as **trilhas entidades de primeira classe** e montar a partitura a partir
  de arquivos por instrumento (modelo git "de verdade", bem mais trabalhoso).

Registrado para não engessar o M2.

### Itens deixados como futuro (stubs/limitações conhecidas do M1)
- Autor é texto livre (sem login). 
- Botão "Reverter" ainda não implementado (a semântica, quando existir, é a (b) do tópico
  de reverter: cria nova revisão a partir da antiga, histórico imutável).
- `.mxl` rejeitado (falta unzip server-side).
