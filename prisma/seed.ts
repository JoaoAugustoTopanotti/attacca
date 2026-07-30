// Seed de demonstração com músicas de domínio público escritas em AlphaTex —
// nada binário no repositório, nada sob copyright. Monta o estado que conta a
// história do produto na home:
//   - 2 músicas completas (guitarra, baixo e bateria), cada trilha de um autor
//     diferente, deixando a autoria por pedaço visível;
//   - 2 músicas com proposta pendente, mostrando o revezamento no meio do
//     caminho e a fila de Propostas populada.
//
// Todas ficam sem dono (`ownerId` null, "música aberta"), para qualquer pessoa
// logada poder revisar as propostas sem depender de uma conta específica.
//
// Usa as mesmas libs do app (materialize, declareTrack, submitTrackContent),
// então tudo que o seed grava passa pela validação real de remontagem.

import { prisma } from "../src/lib/prisma";
import { materializeSongGrid } from "../src/lib/materialize";
import { declareTrack, songCompleteness } from "../src/lib/tracks";
import { submitTrackContent, pendingTrackProposals } from "../src/lib/track-content";

type SeedUser = { id: string; displayName: string };

// Usuários fictícios da comunidade. Sem e-mail: aparecem como autores, mas
// ninguém consegue entrar como eles.
const USERS: Array<{ name: string; instruments: string[] }> = [
  { name: "Helena", instruments: ["guitar"] },
  { name: "Rafa", instruments: ["guitar"] },
  { name: "Clara", instruments: ["bass"] },
  { name: "Miguel", instruments: ["drums"] },
];

// Batida rock básica (MIDI GM: 36 bumbo, 38 caixa, 42 chimbal, 49 crash).
// Nota de percussão sempre entre parênteses: "42.8" solto seria lido como
// casa.corda e quebraria a pauta de articulação.
const ROCK = "(36 42).8 (42).8 (38 42).8 (42).8 (36 42).8 (42).8 (38 42).8 (42).8";
const ROCK_END = "(36 49).4 (42).8 (42).8 (38 42).4 (36 42).4";

type Part = {
  preset: "bass" | "drums";
  author: string; // displayName em USERS
  /** true = entra como proposta pendente, em vez de já aceita */
  pending?: boolean;
  message: string;
  bars: string[]; // um fragmento por compasso, mesmo total da música
};

type SeedSong = {
  slug: string;
  title: string;
  artist: string;
  starter: string; // quem começou: autor do import de guitarra
  message: string;
  alphaTex: string; // documento inicial (só a guitarra)
  parts: Part[];
};

const SONGS: SeedSong[] = [
  // ------------------------------------------------------------------ completa
  {
    slug: "ode-to-joy",
    title: "Ode to Joy",
    artist: "Beethoven",
    starter: "Helena",
    message: "guitarra — melodia completa",
    alphaTex: `\\title "Ode to Joy"
\\subtitle "Beethoven — domínio público"
\\tempo 108
.
\\track "Guitarra"
\\instrument 25
0.1.4 0.1.4 1.1.4 3.1.4 | 3.1.4 1.1.4 0.1.4 3.2.4 |
1.2.4 1.2.4 3.2.4 0.1.4 | 0.1.4{d} 3.2.8 3.2.2 |
0.1.4 0.1.4 1.1.4 3.1.4 | 3.1.4 1.1.4 0.1.4 3.2.4 |
1.2.4 1.2.4 3.2.4 0.1.4 | 3.2.4{d} 1.2.8 1.2.2
`,
    parts: [
      {
        preset: "bass",
        author: "Clara",
        message: "baixo completo",
        bars: [
          "3.3.4 3.3.4 0.1.4 3.3.4",
          "3.4.4 3.4.4 0.2.4 3.4.4",
          "3.3.4 3.3.4 0.1.4 3.3.4",
          "3.4.4 0.2.4 3.4.2",
          "3.3.4 3.3.4 0.1.4 3.3.4",
          "3.4.4 3.4.4 0.2.4 3.4.4",
          "3.3.4 3.3.4 0.1.4 3.3.4",
          "3.4.4 3.4.4 3.3.2",
        ],
      },
      {
        preset: "drums",
        author: "Miguel",
        message: "bateria completa",
        bars: [ROCK, ROCK, ROCK, ROCK, ROCK, ROCK, ROCK, ROCK_END],
      },
    ],
  },
  // ------------------------------------------------------------------ completa
  {
    slug: "when-the-saints",
    title: "When the Saints Go Marching In",
    artist: "Tradicional",
    starter: "Helena",
    message: "guitarra — melodia completa",
    alphaTex: `\\title "When the Saints Go Marching In"
\\subtitle "Tradicional — domínio público"
\\tempo 120
.
\\track "Guitarra"
\\instrument 25
1.2.4 0.1.4 1.1.4 3.1.4 | 3.1.1 | 1.2.4 0.1.4 1.1.4 3.1.4 | 3.1.1 |
0.1.4 1.2.4 0.1.4 3.2.4 | 3.2.1 | 0.1.4 0.1.4 3.2.4 1.2.4 | 3.2.4 3.2.4 1.2.2
`,
    parts: [
      {
        preset: "bass",
        author: "Clara",
        message: "baixo completo",
        bars: [
          "3.3.2 0.1.2",
          "3.3.2 3.3.2",
          "3.3.2 0.1.2",
          "3.4.2 3.4.2",
          "3.3.2 0.1.2",
          "3.4.2 0.2.2",
          "3.3.2 3.4.2",
          "3.3.2 3.3.2",
        ],
      },
      {
        preset: "drums",
        author: "Miguel",
        message: "bateria completa",
        bars: [ROCK, ROCK, ROCK, ROCK, ROCK, ROCK, ROCK, ROCK_END],
      },
    ],
  },
  // ------------------------------------------- pendente: baixo proposto (Clara)
  {
    slug: "greensleeves",
    title: "Greensleeves",
    artist: "Tradicional",
    starter: "Rafa",
    message: "guitarra — falta baixo",
    alphaTex: `\\title "Greensleeves"
\\subtitle "Tradicional inglesa — domínio público"
\\tempo 88
.
\\track "Guitarra"
\\instrument 25
\\ts 3 4
2.4.4 | 0.3.4 1.3.4 3.3.4 | 0.3.4 r.4 0.4.4 | 2.4.4 0.4.4 3.5.4 | 1.4.4 r.4 2.4.4 |
0.3.4 1.3.4 3.3.4 | 0.3.4 r.4 0.4.4 | 2.4.4 0.4.4 1.4.4 | 2.3.4 r.4 2.4.4
`,
    parts: [
      {
        preset: "bass",
        author: "Clara",
        pending: true,
        message: "proposta de baixo",
        bars: [
          "r.4",
          "0.3.2{d}",
          "3.3.2{d}",
          "3.4.2{d}",
          "0.4.2{d}",
          "0.3.2{d}",
          "3.3.2{d}",
          "3.4.4 3.4.4 0.4.4",
          "0.3.2{d}",
        ],
      },
    ],
  },
  // ---------------------------------------- pendente: bateria proposta (Miguel)
  {
    slug: "frere-jacques",
    title: "Frère Jacques",
    artist: "Tradicional",
    starter: "Rafa",
    message: "guitarra — melodia completa",
    alphaTex: `\\title "Frère Jacques"
\\subtitle "Tradicional francesa — domínio público"
\\tempo 112
.
\\track "Guitarra"
\\instrument 25
1.2.4 3.2.4 0.1.4 1.2.4 | 1.2.4 3.2.4 0.1.4 1.2.4 |
0.1.4 1.1.4 3.1.2 | 0.1.4 1.1.4 3.1.2 |
3.1.8 5.1.8 3.1.8 1.1.8 0.1.4 1.2.4 | 3.1.8 5.1.8 3.1.8 1.1.8 0.1.4 1.2.4 |
1.2.4 0.3.4 1.2.2 | 1.2.4 0.3.4 1.2.2
`,
    parts: [
      {
        preset: "bass",
        author: "Clara",
        message: "baixo completo",
        bars: [
          "3.3.2 3.4.2",
          "3.3.2 3.4.2",
          "3.3.2 3.4.2",
          "3.3.2 3.4.2",
          "3.3.2 3.4.2",
          "3.3.2 3.4.2",
          "3.3.4 3.4.4 3.3.2",
          "3.3.4 3.4.4 3.3.2",
        ],
      },
      {
        preset: "drums",
        author: "Miguel",
        pending: true,
        message: "proposta de bateria",
        bars: [ROCK, ROCK, ROCK, ROCK, ROCK, ROCK, ROCK, ROCK_END],
      },
    ],
  },
];

async function ensureUser(name: string, instruments: string[]): Promise<SeedUser> {
  const existing = await prisma.user.findFirst({
    where: { displayName: name, email: null },
  });
  if (existing) return existing;
  return prisma.user.create({ data: { displayName: name, instruments } });
}

async function seedSong(def: SeedSong, users: Map<string, SeedUser>) {
  const existing = await prisma.song.findUnique({ where: { slug: def.slug } });
  if (existing) {
    console.log(`— "${def.title}" já existe, pulando.`);
    return;
  }

  const starter = users.get(def.starter)!;
  const song = await prisma.song.create({
    data: { title: def.title, artist: def.artist, slug: def.slug, ownerId: null },
  });
  await prisma.revision.create({
    data: {
      songId: song.id,
      number: 1,
      authorName: starter.displayName,
      message: def.message,
      source: "alphatex",
      format: "alphatex",
      alphaTex: def.alphaTex,
      sizeBytes: def.alphaTex.length,
    },
  });

  const grid = await materializeSongGrid(song.id);
  // A materialização só grava o cache de nome: liga aqui a identidade real de
  // quem começou. Neste ponto só existem as células do import de guitarra.
  await prisma.cellContribution.updateMany({
    where: { cell: { songId: song.id } },
    data: { authorId: starter.id },
  });

  for (const part of def.parts) {
    const author = users.get(part.author)!;
    const actor = { id: author.id, displayName: author.displayName };
    const track = await declareTrack(song.id, { family: part.preset }, undefined, actor);

    if (part.pending) {
      // `submitTrackContent` só gera proposta quando o ator não é o dono, e
      // numa música aberta viraria aceite direto. Um dono temporário durante o
      // submit faz a proposta nascer pendente pelo caminho real, com validação
      // e merge base; depois a música volta a ficar aberta.
      await prisma.song.update({
        where: { id: song.id },
        data: { ownerId: starter.id },
      });
      await submitTrackContent(song.id, track.order, part.bars.join(" | "), actor);
      await prisma.song.update({ where: { id: song.id }, data: { ownerId: null } });
    } else {
      await submitTrackContent(song.id, track.order, part.bars.join(" | "), actor);
    }
  }

  const [completeness, proposals] = await Promise.all([
    songCompleteness(song.id),
    pendingTrackProposals(song.id),
  ]);
  const perTrack = completeness.tracks
    .map((t) => `${t.name} ${t.percent}%`)
    .join(" · ");
  const pending = proposals
    .map((p) => `${p.trackName} (${p.authorName}, ${p.count} compassos)`)
    .join(" · ");
  console.log(
    `✓ "${def.title}" — ${completeness.percent}% [${grid.measures} compassos] ${perTrack}` +
      (pending ? `\n  ↳ esperando aprovação: ${pending}` : ""),
  );
}

async function main() {
  const users = new Map<string, SeedUser>();
  for (const u of USERS) users.set(u.name, await ensureUser(u.name, u.instruments));

  for (const song of SONGS) await seedSong(song, users);
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (err) => {
    console.error(err);
    await prisma.$disconnect();
    process.exit(1);
  });
