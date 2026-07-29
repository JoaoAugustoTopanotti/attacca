import { NextResponse } from "next/server";
import { setTrackTuning } from "@/lib/structure";
import { getCurrentUser } from "@/lib/identity";

type Params = { params: Promise<{ songId: string; trackOrder: string }> };

// POST { tuning: string[] } — muda a afinação da trilha, mantendo o mesmo nº de
// cordas. Restrito ao dono.
export async function POST(request: Request, { params }: Params) {
  const { songId, trackOrder } = await params;
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Identifique-se primeiro." }, { status: 401 });
  }
  let body: { tuning?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "JSON inválido." }, { status: 400 });
  }
  if (!Array.isArray(body.tuning) || body.tuning.some((t) => typeof t !== "string")) {
    return NextResponse.json(
      { error: "tuning deve ser uma lista de notas (ex.: [\"E4\", \"B3\", …])." },
      { status: 400 },
    );
  }
  try {
    const result = await setTrackTuning(songId, Number(trackOrder), body.tuning, user);
    return NextResponse.json(result);
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Falha ao mudar a afinação." },
      { status: 400 },
    );
  }
}
