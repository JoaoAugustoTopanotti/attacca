import { NextResponse } from "next/server";
import { addCellContribution } from "@/lib/cells";
import { getCurrentUser } from "@/lib/identity";

type Params = { params: Promise<{ cellId: string }> };

// POST /api/cells/:cellId/contributions
// Append-only: creates a NEW contribution (never overwrites). On accept,
// enforces the social gate, validates the whole document and repoints.
// Body: { alphaTex, message?, accept? }. Author = the current identity.
export async function POST(request: Request, { params }: Params) {
  const { cellId } = await params;
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Identifique-se primeiro." }, { status: 401 });
  }

  let body: { alphaTex?: unknown; message?: unknown; accept?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "JSON inválido." }, { status: 400 });
  }
  if (typeof body.alphaTex !== "string") {
    return NextResponse.json(
      { error: "alphaTex (string) é obrigatório." },
      { status: 400 },
    );
  }

  try {
    const created = await addCellContribution(
      cellId,
      {
        alphaTex: body.alphaTex,
        message: typeof body.message === "string" ? body.message : undefined,
        accept: body.accept !== false,
      },
      user,
    );
    return NextResponse.json(created, { status: 201 });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Falha ao salvar a contribuição." },
      { status: 400 },
    );
  }
}
