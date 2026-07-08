import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/identity";

// GET /api/notifications — the current user's recent notifications + unread count.
// Returns an empty feed (not 401) when not identified, so the bell can poll freely.
export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ notifications: [], unread: 0 });

  const [rows, unread] = await Promise.all([
    prisma.notification.findMany({
      where: { userId: user.id },
      orderBy: { createdAt: "desc" },
      take: 30,
    }),
    prisma.notification.count({ where: { userId: user.id, readAt: null } }),
  ]);

  return NextResponse.json({
    unread,
    notifications: rows.map((n) => ({
      id: n.id,
      type: n.type,
      songId: n.songId,
      songTitle: n.songTitle,
      actorName: n.actorName,
      trackName: n.trackName,
      count: n.count,
      message: n.message,
      read: n.readAt !== null,
      createdAt: n.createdAt.toISOString(),
    })),
  });
}
