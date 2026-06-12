import { NextResponse } from "next/server";
import { addCellContribution } from "@/lib/cells";

type Params = { params: Promise<{ cellId: string }> };

// POST /api/cells/:cellId/contributions
// Append-only: creates a NEW contribution (never overwrites). On accept,
// validates the whole document and repoints the cell's accepted pointer.
// Body: { alphaTex, authorName?, message?, accept? }
export async function POST(request: Request, { params }: Params) {
  const { cellId } = await params;

  let body: {
    alphaTex?: unknown;
    authorName?: unknown;
    message?: unknown;
    accept?: unknown;
  };
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
    const created = await addCellContribution(cellId, {
      alphaTex: body.alphaTex,
      authorName: typeof body.authorName === "string" ? body.authorName : undefined,
      message: typeof body.message === "string" ? body.message : undefined,
      accept: body.accept !== false,
    });
    return NextResponse.json(created, { status: 201 });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Falha ao salvar a contribuição." },
      { status: 400 },
    );
  }
}
