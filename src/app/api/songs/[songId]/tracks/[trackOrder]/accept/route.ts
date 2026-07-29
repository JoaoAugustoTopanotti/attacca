import { NextResponse } from "next/server";
import {
  acceptTrackProposals,
  rejectTrackProposals,
  UnresolvedConflictsError,
  type ConflictResolutions,
} from "@/lib/track-content";
import { getCurrentUser } from "@/lib/identity";

type Params = { params: Promise<{ songId: string; trackOrder: string }> };

// Resoluções por compasso (order → "current" | "proposed"), exigidas quando a
// proposta conflita com mudanças mais novas na mesma célula.
function parseResolutions(raw: unknown): ConflictResolutions {
  const out: ConflictResolutions = {};
  if (raw && typeof raw === "object") {
    for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
      const order = Number(k);
      if (Number.isInteger(order) && (v === "current" || v === "proposed")) {
        out[order] = v;
      }
    }
  }
  return out;
}

// POST { authorId, action?: "accept" | "reject", resolutions? } — o dono aceita
// ou recusa, de uma vez, todas as propostas pendentes de um autor nesta trilha.
// A ação padrão é aceitar. Responde 409 quando há conflito de mesma célula sem
// escolha informada.
export async function POST(request: Request, { params }: Params) {
  const { songId, trackOrder } = await params;
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Identifique-se primeiro." }, { status: 401 });
  }
  let body: { authorId?: unknown; action?: unknown; resolutions?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "JSON inválido." }, { status: 400 });
  }
  if (typeof body.authorId !== "string") {
    return NextResponse.json({ error: "authorId é obrigatório." }, { status: 400 });
  }
  const reject = body.action === "reject";
  try {
    const result = reject
      ? await rejectTrackProposals(songId, Number(trackOrder), body.authorId, user)
      : await acceptTrackProposals(
          songId,
          Number(trackOrder),
          body.authorId,
          user,
          parseResolutions(body.resolutions),
        );
    return NextResponse.json(result);
  } catch (e) {
    if (e instanceof UnresolvedConflictsError) {
      return NextResponse.json({ error: e.message, conflicts: e.bars }, { status: 409 });
    }
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Falha." },
      { status: 400 },
    );
  }
}
