import { NextResponse } from "next/server";
import { previewTrackContent } from "@/lib/track-content";

type Params = { params: Promise<{ songId: string; trackOrder: string }> };

// POST { alphaTex } — monta a música completa com a edição local desta trilha
// aplicada, sem gravar nada. É o que faz o play do editor tocar o que está na
// tela.
export async function POST(request: Request, { params }: Params) {
  const { songId, trackOrder } = await params;
  let body: { alphaTex?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "JSON inválido." }, { status: 400 });
  }
  if (typeof body.alphaTex !== "string") {
    return NextResponse.json({ error: "alphaTex é obrigatório." }, { status: 400 });
  }
  try {
    const result = await previewTrackContent(songId, Number(trackOrder), body.alphaTex);
    if (!result.valid) {
      return NextResponse.json(
        { error: `A edição atual não monta um documento válido${result.error ? `: ${result.error}` : "."}` },
        { status: 422 },
      );
    }
    return NextResponse.json({ alphaTex: result.alphaTex });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Falha ao montar a pré-visualização." },
      { status: 400 },
    );
  }
}
