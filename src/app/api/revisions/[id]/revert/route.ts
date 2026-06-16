import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { readRevisionFile } from "@/lib/storage";

type Params = { params: Promise<{ id: string }> };

// POST /api/revisions/:id/revert — git-style revert.
// Creates a NEW revision (next number) from the content of revision :id.
// History stays immutable: the old revision is never changed or deleted.
// Optional JSON body: { authorName? }.
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
    // no/invalid body — keep default author
  }

  const last = await prisma.revision.findFirst({
    where: { songId: source.songId },
    orderBy: { number: "desc" },
    select: { number: true },
  });
  const number = (last?.number ?? 0) + 1;
  const message = `Revertido para #${source.number}`;

  // Inline (AlphaTex) revisions: just copy the text.
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

  // File-backed revisions: copy the bytes into a fresh stored file so each
  // revision stays self-contained.
  // Source bytes: prefer the DB blob, fall back to legacy disk.
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
      blob: new Uint8Array(bytes), // copy the provenance blob (in DB)
      alphaTex: source.alphaTex, // carry the canonical form along
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
