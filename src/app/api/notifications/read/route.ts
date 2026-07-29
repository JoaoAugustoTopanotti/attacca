import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/identity";

// POST /api/notifications/read { ids?: string[] }
// Marca as notificações indicadas como lidas, ou todas as não lidas se `ids`
// não for informado.
export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Identifique-se primeiro." }, { status: 401 });
  }
  const body = await request.json().catch(() => ({}));
  const ids = Array.isArray(body?.ids)
    ? body.ids.filter((x: unknown): x is string => typeof x === "string")
    : null;

  const where =
    ids && ids.length > 0
      ? { userId: user.id, id: { in: ids } }
      : { userId: user.id, readAt: null };

  const result = await prisma.notification.updateMany({
    where,
    data: { readAt: new Date() },
  });
  return NextResponse.json({ updated: result.count });
}
