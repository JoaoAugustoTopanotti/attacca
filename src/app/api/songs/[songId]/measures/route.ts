import { NextResponse } from "next/server";
import { addMeasure, deleteMeasure } from "@/lib/measures";
import { getCurrentUser } from "@/lib/identity";

type Params = { params: Promise<{ songId: string }> };

// POST { afterOrder } — insere um compasso vazio após `afterOrder` (dono apenas).
export async function POST(request: Request, { params }: Params) {
  const { songId } = await params;
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Identifique-se primeiro." }, { status: 401 });
  }
  let body: { afterOrder?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "JSON inválido." }, { status: 400 });
  }
  if (typeof body.afterOrder !== "number") {
    return NextResponse.json({ error: "afterOrder é obrigatório." }, { status: 400 });
  }
  try {
    const result = await addMeasure(songId, body.afterOrder, user);
    return NextResponse.json(result, { status: 201 });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Falha ao adicionar compasso." },
      { status: 400 },
    );
  }
}

// DELETE ?order=N — remove o compasso N (dono apenas).
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
