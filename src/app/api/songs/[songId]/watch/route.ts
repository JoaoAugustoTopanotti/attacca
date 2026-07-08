import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/identity";
import { watchSong, unwatchSong, isWatching } from "@/lib/notifications";

type Params = { params: Promise<{ songId: string }> };

// GET — is the current user following this song? (false when not identified)
export async function GET(_request: Request, { params }: Params) {
  const { songId } = await params;
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ watching: false, canWatch: false });
  return NextResponse.json({ watching: await isWatching(user.id, songId), canWatch: true });
}

// POST — follow this song. DELETE — unfollow. Both require identity.
export async function POST(_request: Request, { params }: Params) {
  const { songId } = await params;
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Identifique-se primeiro." }, { status: 401 });
  }
  await watchSong(user.id, songId);
  return NextResponse.json({ watching: true });
}

export async function DELETE(_request: Request, { params }: Params) {
  const { songId } = await params;
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Identifique-se primeiro." }, { status: 401 });
  }
  await unwatchSong(user.id, songId);
  return NextResponse.json({ watching: false });
}
