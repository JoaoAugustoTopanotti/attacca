import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

// ---------------------------------------------------------------------------
// Demo songs — all public domain, written in AlphaTex so no binary files are
// committed and no copyright issues arise. Instruments follow GM standard.
// ---------------------------------------------------------------------------

const SONGS: Array<{
  slug: string;
  title: string;
  artist: string;
  alphaTex: string;
  message: string;
}> = [
  {
    slug: "gitsong-demo",
    title: "GitSong Demo",
    artist: "GitSong",
    message: "Demo inicial em AlphaTex",
    alphaTex: `\\title "GitSong Demo"
\\subtitle "Exemplo de revezamento"
\\tempo 100
.
\\track "Guitarra"
\\instrument 25
:4 0.6 2.6 3.6 0.5 | 2.5 3.5 0.4 2.4 | :2 0.6 3.6
\\track "Baixo"
\\instrument 33
\\tuning G2 D2 A1 E1
:4 0.4 0.4 0.3 0.3 | 0.2 0.2 2.3 2.3 | :2 0.4 0.3
`,
  },
  {
    slug: "ode-to-joy",
    title: "Ode to Joy",
    artist: "Beethoven",
    message: "Guitarra solo — falta baixo",
    // Ode to Joy melody on guitar (4th string, standard tuning), 8 measures
    alphaTex: `\\title "Ode to Joy"
\\subtitle "Beethoven — domínio público"
\\tempo 104
.
\\track "Guitarra"
\\instrument 25
:4 2.3 2.3 3.3 0.2 | 0.2 3.3 2.3 1.3 | 0.3 0.3 1.3 3.4 | 3.4 1.3 0.3 r |
2.3 2.3 3.3 0.2 | 0.2 3.3 2.3 1.3 | 0.3 0.3 1.3 3.4 | :2 3.4 1.3
`,
  },
  {
    slug: "greensleeves",
    title: "Greensleeves",
    artist: "Tradicional",
    message: "Guitarra — falta violão de acompanhamento",
    // Greensleeves melody in 3/4 on guitar, 8 measures
    alphaTex: `\\title "Greensleeves"
\\subtitle "Tradicional inglesa — domínio público"
\\tempo 88
.
\\track "Guitarra Melódica"
\\instrument 25
\\ts 3 4
:4 2.4 | 0.3 1.3 3.3 | 0.3 r 0.4 | 2.4 0.4 3.5 | 1.4 r 2.4 |
0.3 1.3 3.3 | 0.3 r 0.4 | 2.4 0.4 1.4 | 2.3 r 2.4
`,
  },
];

async function main() {
  for (const song of SONGS) {
    const record = await prisma.song.upsert({
      where: { slug: song.slug },
      update: {},
      create: {
        title: song.title,
        artist: song.artist,
        slug: song.slug,
      },
    });

    const existing = await prisma.revision.findFirst({
      where: { songId: record.id },
    });

    if (!existing) {
      await prisma.revision.create({
        data: {
          songId: record.id,
          number: 1,
          authorName: "GitSong",
          message: song.message,
          source: "alphatex",
          format: "alphatex",
          alphaTex: song.alphaTex,
          sizeBytes: song.alphaTex.length,
        },
      });
      console.log(`✓ Seeded "${song.title}"`);
    } else {
      console.log(`— "${song.title}" já existe, pulando.`);
    }
  }
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (err) => {
    console.error(err);
    await prisma.$disconnect();
    process.exit(1);
  });
