import { NextResponse } from "next/server";
import { setMeasureTempo } from "@/lib/structure";
import { getCurrentUser } from "@/lib/identity";

type Params = { params: Promise<{ songId: string }> };

// POST { bpm, measure? } — andamento da música, restrito ao dono. `measure` 0
// (padrão) define o andamento inicial; valores maiores criam uma mudança a
// partir daquele compasso, e `bpm` null a remove.
export async function POST(request: Request, { params }: Params) {
  const { songId } = await params;
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Identifique-se primeiro." }, { status: 401 });
  }
  let body: { bpm?: unknown; measure?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "JSON inválido." }, { status: 400 });
  }
  const bpm = body.bpm === null ? null : Number(body.bpm);
  const measure = body.measure === undefined ? 0 : Number(body.measure);
  if (!Number.isInteger(measure) || measure < 0) {
    return NextResponse.json({ error: "Compasso inválido." }, { status: 400 });
  }
  try {
    const result = await setMeasureTempo(songId, measure, bpm, user);
    return NextResponse.json(result);
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Falha ao mudar o andamento." },
      { status: 400 },
    );
  }
}
