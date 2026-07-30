import { NextResponse } from "next/server";
import { declareTrack, INSTRUMENT_FAMILIES, type DeclareSpec } from "@/lib/tracks";
import { LEGACY_PRESET_SPECS } from "@/lib/instrument-presets";
import { getCurrentUser } from "@/lib/identity";

type Params = { params: Promise<{ songId: string }> };

// GET — os instrumentos disponíveis para declarar, com as características
// (timbres GM e número de cordas) de cada um.
export async function GET() {
  return NextResponse.json(INSTRUMENT_FAMILIES);
}

// POST /api/songs/:songId/tracks
// body: { family, sound?, strings?, name? } — ou o legado { presetKey, name? }.
// Declara um instrumento de que a música precisa como um slot de trilha vazio
// e sem dono.
export async function POST(request: Request, { params }: Params) {
  const { songId } = await params;
  let body: {
    family?: unknown;
    sound?: unknown;
    strings?: unknown;
    presetKey?: unknown;
    name?: unknown;
  };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "JSON inválido." }, { status: 400 });
  }

  let spec: DeclareSpec | null = null;
  if (typeof body.family === "string") {
    spec = {
      family: body.family,
      sound: typeof body.sound === "string" ? body.sound : undefined,
      strings: typeof body.strings === "number" ? body.strings : undefined,
    };
  } else if (typeof body.presetKey === "string") {
    spec = LEGACY_PRESET_SPECS[body.presetKey] ?? null;
  }
  if (!spec) {
    return NextResponse.json({ error: "family é obrigatório." }, { status: 400 });
  }

  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json(
      { error: "Entre para declarar um instrumento." },
      { status: 401 },
    );
  }
  try {
    const track = await declareTrack(
      songId,
      spec,
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
