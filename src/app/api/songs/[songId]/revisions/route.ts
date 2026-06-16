import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { detectUploadFormat } from "@/lib/format";
import { scoreBytesToAlphaTex } from "@/lib/canonical";
import { getCurrentUser } from "@/lib/identity";

type Params = { params: Promise<{ songId: string }> };

// GET /api/songs/:songId/revisions — revision history, newest first.
export async function GET(_request: Request, { params }: Params) {
  const { songId } = await params;
  const song = await prisma.song.findUnique({ where: { id: songId } });
  if (!song) {
    return NextResponse.json({ error: "Música não encontrada." }, { status: 404 });
  }
  const revisions = await prisma.revision.findMany({
    where: { songId },
    orderBy: { number: "desc" },
    // Exclude blob/alphaTex (large) from the list response.
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

// POST /api/songs/:songId/revisions — upload a file as a new revision.
// multipart/form-data: file (required), authorName?, message?
export async function POST(request: Request, { params }: Params) {
  const { songId } = await params;

  const song = await prisma.song.findUnique({ where: { id: songId } });
  if (!song) {
    return NextResponse.json({ error: "Música não encontrada." }, { status: 404 });
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

  const check = detectUploadFormat(file.name);
  if (!check.ok) {
    return NextResponse.json({ error: check.reason }, { status: 415 });
  }

  const authorRaw = form.get("authorName");
  const messageRaw = form.get("message");
  // Prefer the signed-in identity (ADR 0003); fall back to the form field / anon.
  const me = await getCurrentUser();
  const authorName =
    me?.displayName ??
    (typeof authorRaw === "string" && authorRaw.trim() !== ""
      ? authorRaw.trim()
      : "anon");
  const message =
    typeof messageRaw === "string" && messageRaw.trim() !== ""
      ? messageRaw.trim()
      : null;

  const bytes = new Uint8Array(await file.arrayBuffer());

  // Next per-song revision number.
  const last = await prisma.revision.findFirst({
    where: { songId },
    orderBy: { number: "desc" },
    select: { number: true },
  });
  const number = (last?.number ?? 0) + 1;

  // Derive the canonical alphaTex (versionable form) alongside the provenance
  // blob. Best-effort: null if alphaTab can't parse this file.
  const alphaTex = await scoreBytesToAlphaTex(bytes);

  // Provenance blob lives IN the DB (no disk dependency — deploy-friendly).
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

  // Touch the song so it sorts to the top of the list.
  await prisma.song.update({
    where: { id: songId },
    data: { updatedAt: new Date() },
  });

  return NextResponse.json(revision, { status: 201 });
}
