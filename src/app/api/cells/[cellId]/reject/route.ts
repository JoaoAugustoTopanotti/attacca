import { NextResponse } from "next/server";
import { rejectContribution } from "@/lib/cells";

type Params = { params: Promise<{ cellId: string }> };

// POST /api/cells/:cellId/reject  body: { contributionId }
export async function POST(request: Request, { params }: Params) {
  const { cellId } = await params;
  let body: { contributionId?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "JSON inválido." }, { status: 400 });
  }
  if (typeof body.contributionId !== "string") {
    return NextResponse.json(
      { error: "contributionId é obrigatório." },
      { status: 400 },
    );
  }
  try {
    const rejected = await rejectContribution(cellId, body.contributionId);
    return NextResponse.json(rejected);
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Falha ao recusar." },
      { status: 400 },
    );
  }
}
