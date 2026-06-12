import { NextResponse } from "next/server";
import { acceptContribution } from "@/lib/cells";

type Params = { params: Promise<{ cellId: string }> };

// POST /api/cells/:cellId/accept  body: { contributionId }
// Repoints the cell to an existing contribution (e.g. accepting a proposal).
// Temporary: anyone can accept until track claiming lands.
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
    const accepted = await acceptContribution(cellId, body.contributionId);
    return NextResponse.json(accepted);
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Falha ao aceitar." },
      { status: 400 },
    );
  }
}
