import { NextResponse } from "next/server";
import { googleEnabled } from "@/lib/google";

// GET /api/auth/providers — which sign-in methods this deployment can offer, so
// the modal doesn't show a Google button that would only fail.
export async function GET() {
  return NextResponse.json({ google: googleEnabled });
}
