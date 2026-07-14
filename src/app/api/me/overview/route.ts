import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/identity";
import { accountOverview } from "@/lib/profile";

// GET /api/me/overview — my songs, the songs I follow, and the proposals waiting
// (mine, and the ones waiting for me). The relay's inbox.
export async function GET() {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Entre para ver sua conta." }, { status: 401 });
  }
  return NextResponse.json(await accountOverview(user.id));
}
