import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/identity";
import { accountOverview } from "@/lib/profile";

// GET /api/me/overview — minhas músicas, as que sigo e as propostas em aberto,
// tanto as minhas quanto as que esperam por mim. É o inbox do revezamento.
export async function GET() {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Entre para ver sua conta." }, { status: 401 });
  }
  return NextResponse.json(await accountOverview(user.id));
}
