import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/identity";
import { deleteSongFiles } from "@/lib/storage";

type Params = { params: Promise<{ songId: string }> };

// DELETE /api/songs/[songId] — o dono exclui a própria música, para todos.
// Guarda no estilo do GitHub: o body precisa repetir o título exato, e o
// servidor confere de novo — o clique na UI nunca basta.
// Música sem dono não é excluível: ninguém responde pelo trabalho coletivo.
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

  // Limpa antes os ponteiros de contribuição aceita: essa FK é NoAction, para
  // evitar ciclo de cascade, e o delete tropeçaria nela no meio do caminho.
  await prisma.$transaction([
    prisma.cell.updateMany({
      where: { songId },
      data: { acceptedContributionId: null },
    }),
    prisma.song.delete({ where: { id: songId } }),
  ]);

  // Uploads legados em disco: limpeza best-effort.
  try {
    await deleteSongFiles(songId);
  } catch {
    /* o registro já foi; um arquivo órfão não pode derrubar a exclusão */
  }

  return NextResponse.json({ deleted: true });
}
