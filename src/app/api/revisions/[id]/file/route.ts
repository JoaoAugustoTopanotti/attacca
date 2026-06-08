import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { readRevisionFile } from "@/lib/storage";

type Params = { params: Promise<{ id: string }> };

// GET /api/revisions/:id/file — raw score content for the alphaTab player.
// - source "alphatex": returns the AlphaTex text (text/plain)
// - source "file":     returns the stored bytes (application/octet-stream)
export async function GET(_request: Request, { params }: Params) {
  const { id } = await params;

  const revision = await prisma.revision.findUnique({ where: { id } });
  if (!revision) {
    return NextResponse.json({ error: "Revisão não encontrada." }, { status: 404 });
  }

  if (revision.source === "alphatex") {
    return new NextResponse(revision.alphaTex ?? "", {
      status: 200,
      headers: { "Content-Type": "text/plain; charset=utf-8" },
    });
  }

  if (!revision.storedPath) {
    return NextResponse.json(
      { error: "Arquivo da revisão não encontrado." },
      { status: 404 },
    );
  }

  try {
    const buffer = await readRevisionFile(revision.storedPath);
    return new NextResponse(new Uint8Array(buffer), {
      status: 200,
      headers: {
        "Content-Type": "application/octet-stream",
        "Content-Disposition": `inline; filename="${revision.originalName ?? "score"}"`,
      },
    });
  } catch {
    return NextResponse.json(
      { error: "Falha ao ler o arquivo da revisão." },
      { status: 500 },
    );
  }
}
