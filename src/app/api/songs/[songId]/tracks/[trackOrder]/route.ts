import { NextResponse } from "next/server";
import { deleteTrack } from "@/lib/tracks";
import { NotOwnerError } from "@/lib/authority";
import { getCurrentUser } from "@/lib/identity";

type Params = { params: Promise<{ songId: string; trackOrder: string }> };

// DELETE /api/songs/:songId/tracks/:trackOrder — remove a trilha e tudo que foi
// escrito nela. Só o dono (música sem dono = aberta a identificados).
export async function DELETE(_request: Request, { params }: Params) {
  const { songId, trackOrder } = await params;
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Identifique-se primeiro." }, { status: 401 });
  }
  const order = Number(trackOrder);
  if (!Number.isInteger(order) || order < 0) {
    return NextResponse.json({ error: "Trilha inválida." }, { status: 400 });
  }
  try {
    const result = await deleteTrack(songId, order, user);
    return NextResponse.json(result);
  } catch (e) {
    if (e instanceof NotOwnerError) {
      return NextResponse.json({ error: e.message }, { status: 403 });
    }
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Falha ao remover a trilha." },
      { status: 400 },
    );
  }
}
