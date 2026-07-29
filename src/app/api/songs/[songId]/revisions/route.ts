import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { detectUploadFormat } from "@/lib/format";
import { scoreBytesToAlphaTex } from "@/lib/canonical";
import { getCurrentUser } from "@/lib/identity";
import { assertSongOwner, NotOwnerError } from "@/lib/authority";
import { materializeSongGrid } from "@/lib/materialize";

type Params = { params: Promise<{ songId: string }> };

// GET /api/songs/:songId/revisions — histórico de revisões, da mais nova.
export async function GET(_request: Request, { params }: Params) {
  const { songId } = await params;
  const song = await prisma.song.findUnique({ where: { id: songId } });
  if (!song) {
    return NextResponse.json({ error: "Música não encontrada." }, { status: 404 });
  }
  const revisions = await prisma.revision.findMany({
    where: { songId },
    orderBy: { number: "desc" },
    // O blob e o alphaTex são grandes e ficam fora da listagem.
    select: {
      id: true,
      number: true,
      authorName: true,
      message: true,
      source: true,
      format: true,
      originalName: true,
      kind: true,
      createdAt: true,
    },
  });
  return NextResponse.json(revisions);
}

// Cap de upload: um .gp real tem centenas de KB; o arquivo inteiro vai para a
// memória e para o banco, então sem limite um único POST derruba o processo.
const MAX_UPLOAD_BYTES = 10 * 1024 * 1024; // 10 MB

// POST /api/songs/:songId/revisions — envia um arquivo como nova revisão.
// multipart/form-data: file (obrigatório), message?
export async function POST(request: Request, { params }: Params) {
  const { songId } = await params;

  // Upload é ato de dono: o primeiro upload define o conteúdo inicial da grade
  // e os demais entram no histórico como revisões. Música sem dono (seed/
  // legado) segue aberta a qualquer pessoa identificada.
  const me = await getCurrentUser();
  if (!me) {
    return NextResponse.json(
      { error: "Entre para enviar um arquivo." },
      { status: 401 },
    );
  }

  const song = await prisma.song.findUnique({
    where: { id: songId },
    include: { owner: true },
  });
  if (!song) {
    return NextResponse.json({ error: "Música não encontrada." }, { status: 404 });
  }
  try {
    assertSongOwner(song, me, "envia arquivos");
  } catch (e) {
    if (e instanceof NotOwnerError) {
      return NextResponse.json({ error: e.message }, { status: 403 });
    }
    throw e;
  }

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return NextResponse.json(
      { error: "Esperado multipart/form-data." },
      { status: 400 },
    );
  }

  const file = form.get("file");
  if (!(file instanceof File) || file.size === 0) {
    return NextResponse.json({ error: "Nenhum arquivo enviado." }, { status: 400 });
  }
  if (file.size > MAX_UPLOAD_BYTES) {
    return NextResponse.json(
      { error: "Arquivo grande demais (limite: 10 MB)." },
      { status: 413 },
    );
  }

  const check = detectUploadFormat(file.name);
  if (!check.ok) {
    return NextResponse.json({ error: check.reason }, { status: 415 });
  }

  const messageRaw = form.get("message");
  const authorName = me.displayName;
  const message =
    typeof messageRaw === "string" && messageRaw.trim() !== ""
      ? messageRaw.trim()
      : null;

  const bytes = new Uint8Array(await file.arrayBuffer());

  // Próximo número de revisão desta música.
  const last = await prisma.revision.findFirst({
    where: { songId },
    orderBy: { number: "desc" },
    select: { number: true },
  });
  const number = (last?.number ?? 0) + 1;

  // Deriva o alphaTex canônico, a forma versionável. Sem canônico não há grade
  // de colaboração, e música sem grade é um beco sem saída: o upload é barrado
  // aqui em vez de aceito pela metade.
  const alphaTex = await scoreBytesToAlphaTex(bytes);
  if (!alphaTex) {
    return NextResponse.json(
      {
        error:
          "Não foi possível converter este arquivo para o formato colaborativo. " +
          "Tente exportar como Guitar Pro (.gp) e enviar de novo.",
      },
      { status: 422 },
    );
  }

  // O blob de proveniência vive no banco, sem depender de disco no deploy.
  const revision = await prisma.revision.create({
    data: {
      songId,
      number,
      authorName,
      message,
      source: "file",
      originalName: file.name,
      format: check.format,
      sizeBytes: bytes.byteLength,
      blob: Buffer.from(bytes),
      alphaTex,
    },
    select: {
      id: true,
      number: true,
      authorName: true,
      message: true,
      source: true,
      format: true,
      originalName: true,
      kind: true,
      createdAt: true,
    },
  });

  // Materializa a grade trilha×compasso já no upload, para colaborar não
  // depender de um passo manual. Só quando a música ainda não tem grade:
  // re-materializar uma grade viva apagaria as contribuições do revezamento.
  const hasGrid = (await prisma.measure.count({ where: { songId } })) > 0;
  if (!hasGrid) {
    try {
      await materializeSongGrid(songId);
    } catch (e) {
      await prisma.revision.delete({ where: { id: revision.id } });
      return NextResponse.json(
        {
          error:
            "O arquivo converteu mas não montou a grade de colaboração" +
            (e instanceof Error ? `: ${e.message.split("\n")[0]}` : "."),
        },
        { status: 422 },
      );
    }
  }

  // Atualiza a música para ela subir ao topo da lista.
  await prisma.song.update({
    where: { id: songId },
    data: { updatedAt: new Date() },
  });

  return NextResponse.json(revision, { status: 201 });
}
