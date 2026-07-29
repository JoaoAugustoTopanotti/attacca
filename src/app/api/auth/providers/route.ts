import { NextResponse } from "next/server";
import { googleEnabled } from "@/lib/google";

// GET /api/auth/providers — métodos de login que este deploy oferece, para o
// modal não exibir um botão do Google que só falharia.
export async function GET() {
  return NextResponse.json({ google: googleEnabled });
}
