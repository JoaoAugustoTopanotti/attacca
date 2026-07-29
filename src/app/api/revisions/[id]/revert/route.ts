import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { readRevisionFile } from "@/lib/storage";

type Params = { params: Promise<{ id: string }> };

// POST /api/revisions/:id/revert — reverter no estilo git: cria uma revisão
// nova a partir do conteúdo da revisão :id. O histórico é imutável, então a
// revisão antiga nunca é alterada nem apagada.
// Body JSON opcional: { authorName? }.
export async function POST(request: Request, { params }: Params) {
  const { id } = await params;

  const source = await prisma.revision.findUnique({ where: { id } });
  if (!source) {
    return NextResponse.json({ error: "Revisão não encontrada." }, { status: 404 });
  }

  let authorName = "anon";
  try {
    const body = await request.json();
    if (typeof body?.authorName === "string" && body.authorName.trim() !== "") {
      authorName = body.authorName.trim();
    }
  } catch {
    // body ausente ou inválido: mantém o autor padrão
  }

  const last = await prisma.revision.findFirst({
    where: { songId: source.songId },
    orderBy: { number: "desc" },
    select: { number: true },
  });
  const number = (last?.number ?? 0) + 1;
  const message = `Revertido para #${source.number}`;

  // Revisões inline (AlphaTex): basta copiar o texto.
  if (source.source === "alphatex") {
    const created = await prisma.revision.create({
      data: {
        songId: source.songId,
        number,
        authorName,
        message,
        source: "alphatex",
        format: "alphatex",
        alphaTex: source.alphaTex,
      },
    });
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

  const created = await prisma.revision.create({
    data: {
      songId: source.songId,
      number,
      authorName,
      message,
      source: "file",
      originalName: source.originalName,
      format: source.format,
      sizeBytes: source.sizeBytes,
      blob: new Uint8Array(bytes), // cópia do blob de proveniência
      alphaTex: source.alphaTex, // leva junto a forma canônica
    },
  });

  await prisma.song.update({
    where: { id: source.songId },
    data: { updatedAt: new Date() },
  });

  return NextResponse.json(
    { id: created.id, number: created.number },
    { status: 201 },
  );
}
