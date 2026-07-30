import { NextResponse } from "next/server";
import {
  addMeasure,
  deleteMeasure,
  measureOccupancy,
  MAX_MEASURES_PER_ADD,
} from "@/lib/measures";
import { getCurrentUser } from "@/lib/identity";

type Params = { params: Promise<{ songId: string }> };

// GET ?order=N — o que se perde ao remover o compasso N (trilhas com conteúdo,
// propostas em aberto). Só leitura: alimenta o aviso proporcional da UI.
export async function GET(request: Request, { params }: Params) {
  const { songId } = await params;
  const order = Number(new URL(request.url).searchParams.get("order"));
  if (!Number.isInteger(order) || order < 0) {
    return NextResponse.json({ error: "order inválido." }, { status: 400 });
  }
  try {
    return NextResponse.json(await measureOccupancy(songId, order));
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Compasso não encontrado." },
      { status: 404 },
    );
  }
}

// POST { afterOrder, count? } — insere `count` compassos vazios (padrão 1) após
// `afterOrder`. Só o dono.
export async function POST(request: Request, { params }: Params) {
  const { songId } = await params;
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Identifique-se primeiro." }, { status: 401 });
  }
  let body: { afterOrder?: unknown; count?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "JSON inválido." }, { status: 400 });
  }
  if (typeof body.afterOrder !== "number") {
    return NextResponse.json({ error: "afterOrder é obrigatório." }, { status: 400 });
  }
  const count = body.count === undefined ? 1 : body.count;
  if (
    typeof count !== "number" ||
    !Number.isInteger(count) ||
    count < 1 ||
    count > MAX_MEASURES_PER_ADD
  ) {
    return NextResponse.json(
      { error: `count deve ser um inteiro de 1 a ${MAX_MEASURES_PER_ADD}.` },
      { status: 400 },
    );
  }
  try {
    const result = await addMeasure(songId, body.afterOrder, user, count);
    return NextResponse.json(result, { status: 201 });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Falha ao adicionar compasso." },
      { status: 400 },
    );
  }
}

// DELETE ?order=N — remove o compasso N. Só o dono.
export async function DELETE(request: Request, { params }: Params) {
  const { songId } = await params;
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Identifique-se primeiro." }, { status: 401 });
  }
  const order = Number(new URL(request.url).searchParams.get("order"));
  if (!Number.isInteger(order) || order < 0) {
    return NextResponse.json({ error: "order inválido." }, { status: 400 });
  }
  try {
    const result = await deleteMeasure(songId, order, user);
    return NextResponse.json(result);
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Falha ao remover compasso." },
      { status: 400 },
    );
  }
}
