import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/identity";

// GET /api/me — the current identity (or null). Sign-in now happens through the
// magic-link flow (POST /api/auth/request → GET /api/auth/verify); there is no
// longer a "create identity from a name" endpoint here.
export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json(null);
  return NextResponse.json({
    id: user.id,
    displayName: user.displayName,
    email: user.email,
  });
}
