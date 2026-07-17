import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/identity";
import { deleteSongFiles } from "@/lib/storage";

type Params = { params: Promise<{ songId: string }> };

// DELETE /api/songs/[songId] — the owner deletes their song, for everyone.
// GitHub-style guard: the body must repeat the exact song title (the UI gates
// the button on it, and we re-check here — the click alone is never enough).
// Ownerless songs (seeds/legacy) have no one entitled to erase shared work.
export async function DELETE(request: Request, { params }: Params) {
  const { songId } = await params;

  const me = await getCurrentUser();
  if (!me) {
    return NextResponse.json({ error: "Identifique-se primeiro." }, { status: 401 });
  }

  const song = await prisma.song.findUnique({ where: { id: songId } });
  if (!song) {
    return NextResponse.json({ error: "Música não encontrada." }, { status: 404 });
  }
  if (!song.ownerId || song.ownerId !== me.id) {
    return NextResponse.json(
      { error: "Só quem criou a música pode excluí-la." },
      { status: 403 },
    );
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    body = null;
  }
  const { confirmTitle } = (body ?? {}) as { confirmTitle?: unknown };
  if (typeof confirmTitle !== "string" || confirmTitle.trim() !== song.title) {
    return NextResponse.json(
      { error: "A confirmação não bate com o título da música." },
      { status: 400 },
    );
  }

  // Clear the accepted-contribution pointers first: that FK is NoAction (to
  // avoid a cascade cycle), so a bare song delete could trip it mid-cascade.
  await prisma.$transaction([
    prisma.cell.updateMany({
      where: { songId },
      data: { acceptedContributionId: null },
    }),
    prisma.song.delete({ where: { id: songId } }),
  ]);

  // Legacy on-disk uploads (pre-DB-blob revisions) — best-effort cleanup.
  try {
    await deleteSongFiles(songId);
  } catch {
    /* the record is gone; a stray file must not fail the delete */
  }

  return NextResponse.json({ deleted: true });
}
