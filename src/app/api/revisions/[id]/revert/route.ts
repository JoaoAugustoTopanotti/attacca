import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { readRevisionFile } from "@/lib/storage";
import { getCurrentUser } from "@/lib/identity";
import { assertSongOwner, NotOwnerError } from "@/lib/authority";
import { createNumberedRevision } from "@/lib/revisions";

type Params = { params: Promise<{ id: string }> };

// POST /api/revisions/:id/revert — reverter no estilo git: cria uma revisão
// nova a partir do conteúdo da revisão :id. O histórico é imutável, então a
// revisão antiga nunca é alterada nem apagada. Ato de dono: reverter troca o
// que todo mundo ouve.
export async function POST(_request: Request, { params }: Params) {
  const { id } = await params;

  const me = await getCurrentUser();
  if (!me) {
    return NextResponse.json(
      { error: "Entre para reverter uma revisão." },
      { status: 401 },
    );
  }

  const source = await prisma.revision.findUnique({ where: { id } });
  if (!source) {
    return NextResponse.json({ error: "Revisão não encontrada." }, { status: 404 });
  }

  const song = await prisma.song.findUnique({
    where: { id: source.songId },
    include: { owner: true },
  });
  if (!song) {
    return NextResponse.json({ error: "Música não encontrada." }, { status: 404 });
  }
  try {
    assertSongOwner(song, me, "reverte o histórico");
  } catch (e) {
    if (e instanceof NotOwnerError) {
      return NextResponse.json({ error: e.message }, { status: 403 });
    }
    throw e;
  }

  const authorName = me.displayName;

  const message = `Revertido para #${source.number}`;

  // Revisões inline (AlphaTex): basta copiar o texto.
  if (source.source === "alphatex") {
    const created = await createNumberedRevision(source.songId, (number) =>
      prisma.revision.create({
        data: {
          songId: source.songId,
          number,
          authorName,
          message,
          source: "alphatex",
          format: "alphatex",
          alphaTex: source.alphaTex,
        },
      }),
    );
    await prisma.song.update({
      where: { id: source.songId },
      data: { updatedAt: new Date() },
    });
    return NextResponse.json(created, { status: 201 });
  }

  // Revisões com arquivo: copia os bytes para um arquivo novo, mantendo cada
  // revisão autocontida. A origem preferida é o blob no banco, com fallback
  // para o disco legado.
  let bytes: Buffer | null = source.blob ? Buffer.from(source.blob) : null;
  if (!bytes && source.storedPath) {
    try {
      bytes = await readRevisionFile(source.storedPath);
    } catch {
      bytes = null;
    }
  }
  if (!bytes) {
    return NextResponse.json(
      { error: "A revisão de origem não tem arquivo para reverter." },
      { status: 400 },
    );
  }

  const blobCopy = new Uint8Array(bytes);
  const created = await createNumberedRevision(source.songId, (number) =>
    prisma.revision.create({
      data: {
        songId: source.songId,
        number,
        authorName,
        message,
        source: "file",
        originalName: source.originalName,
        format: source.format,
        sizeBytes: source.sizeBytes,
        blob: blobCopy, // cópia do blob de proveniência
        alphaTex: source.alphaTex, // leva junto a forma canônica
      },
    }),
  );

  await prisma.song.update({
    where: { id: source.songId },
    data: { updatedAt: new Date() },
  });

  return NextResponse.json(
    { id: created.id, number: created.number },
    { status: 201 },
  );
}
