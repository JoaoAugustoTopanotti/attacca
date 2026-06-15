import { NextResponse } from "next/server";
import { declareTrack, INSTRUMENT_PRESETS } from "@/lib/tracks";

type Params = { params: Promise<{ songId: string }> };

// GET — the instrument presets available to declare.
export async function GET() {
  return NextResponse.json(INSTRUMENT_PRESETS);
}

// POST /api/songs/:songId/tracks  body: { presetKey, name? }
// Declares an instrument the song needs as an empty, unclaimed track slot.
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
    const track = await declareTrack(
      songId,
      body.presetKey,
      typeof body.name === "string" ? body.name : undefined,
    );
    return NextResponse.json(track, { status: 201 });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Falha ao declarar instrumento." },
      { status: 400 },
    );
  }
}
