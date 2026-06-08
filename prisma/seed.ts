import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

// A small two-track AlphaTex piece so the app plays something the moment you
// open it — no binary tab files committed, no copyrighted material.
const DEMO_ALPHATEX = `\\title "GitSong Demo"
\\subtitle "Tocável de primeira (AlphaTex)"
\\tempo 100
.
\\track "Guitarra"
\\instrument 25
:4 0.6 2.6 3.6 0.5 | 2.5 3.5 0.4 2.4 | :2 0.6 3.6
\\track "Baixo"
\\instrument 33
\\tuning G2 D2 A1 E1
:4 0.4 0.4 0.3 0.3 | 0.2 0.2 2.3 2.3 | :2 0.4 0.3
`;

async function main() {
  const slug = "gitsong-demo";

  const song = await prisma.song.upsert({
    where: { slug },
    update: {},
    create: {
      title: "GitSong Demo",
      artist: "GitSong",
      slug,
    },
  });

  const existing = await prisma.revision.findFirst({
    where: { songId: song.id },
  });

  if (!existing) {
    await prisma.revision.create({
      data: {
        songId: song.id,
        number: 1,
        authorName: "GitSong",
        message: "Demo inicial em AlphaTex",
        source: "alphatex",
        format: "alphatex",
        alphaTex: DEMO_ALPHATEX,
      },
    });
    console.log(`Seeded demo song "${song.title}" with revision #1.`);
  } else {
    console.log(`Demo song already present — skipping revision seed.`);
  }
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (err) => {
    console.error(err);
    await prisma.$disconnect();
    process.exit(1);
  });
