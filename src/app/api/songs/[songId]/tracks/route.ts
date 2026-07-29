import { NextResponse } from "next/server";
import { declareTrack, INSTRUMENT_PRESETS } from "@/lib/tracks";
import { getCurrentUser } from "@/lib/identity";

type Params = { params: Promise<{ songId: string }> };

// GET — os presets de instrumento disponíveis para declarar.
export async function GET() {
  return NextResponse.json(INSTRUMENT_PRESETS);
}

// POST /api/songs/:songId/tracks  body: { presetKey, name? }
// Declara um instrumento de que a música precisa como um slot de trilha vazio
// e sem dono.
export async function POST(request: Request, { params }: Params) {
  const { songId } = await params;
  let body: { presetKey?: unknown; name?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "JSON inválido." }, { status: 400 });
  }
  if (typeof body.presetKey !== "string") {
    return NextResponse.json({ error: "presetKey é obrigatório." }, { status: 400 });
  }
  try {
    const user = await getCurrentUser();
    const track = await declareTrack(
      songId,
      body.presetKey,
      typeof body.name === "string" ? body.name : undefined,
      user,
    );
    return NextResponse.json(track, { status: 201 });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Falha ao declarar instrumento." },
      { status: 400 },
    );
  }
}
