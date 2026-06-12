import { NextResponse } from "next/server";
import { getCellByCoords } from "@/lib/cells";

type Params = { params: Promise<{ songId: string }> };

// GET /api/songs/:songId/cell?track=<order>&measure=<order>
// Returns the cell at those grid coordinates with its contribution history.
export async function GET(request: Request, { params }: Params) {
  const { songId } = await params;
  const url = new URL(request.url);
  const track = Number(url.searchParams.get("track"));
  const measure = Number(url.searchParams.get("measure"));
  if (!Number.isInteger(track) || !Number.isInteger(measure)) {
    return NextResponse.json(
      { error: "Parâmetros track e measure (inteiros) são obrigatórios." },
      { status: 400 },
    );
  }

  const found = await getCellByCoords(songId, track, measure);
  if (!found) {
    return NextResponse.json(
      { error: "Célula não encontrada (a música foi materializada?)." },
      { status: 404 },
    );
  }
  return NextResponse.json(found);
}
