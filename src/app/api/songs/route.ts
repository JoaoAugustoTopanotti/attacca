import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { slugify } from "@/lib/slug";
import { getCurrentUser } from "@/lib/identity";

// GET /api/songs — list songs (newest first) with revision counts.
export async function GET() {
  const songs = await prisma.song.findMany({
    orderBy: { updatedAt: "desc" },
    include: { _count: { select: { revisions: true } } },
  });
  return NextResponse.json(songs);
}

// POST /api/songs — create a song. Body: { title, artist? }. Requires identity:
// the creator owns the song (maintainer model), so an anonymous song would be
// ownerless — no one to accept proposals or answer for it.
export async function POST(request: Request) {
  const me = await getCurrentUser();
  if (!me) {
    return NextResponse.json({ error: "Entre para criar uma música." }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "JSON inválido." }, { status: 400 });
  }

  const { title, artist } = (body ?? {}) as {
    title?: unknown;
    artist?: unknown;
  };

  if (typeof title !== "string" || title.trim() === "") {
    return NextResponse.json({ error: "Título é obrigatório." }, { status: 400 });
  }

  const artistValue =
    typeof artist === "string" && artist.trim() !== "" ? artist.trim() : null;

  // Ensure a unique slug by appending a short suffix on collision.
  const base = slugify(title);
  let slug = base;
  for (let attempt = 0; attempt < 5; attempt++) {
    const existing = await prisma.song.findUnique({ where: { slug } });
    if (!existing) break;
    slug = `${base}-${Math.random().toString(36).slice(2, 6)}`;
  }

  const song = await prisma.song.create({
    data: {
      title: title.trim(),
      artist: artistValue,
      slug,
      ownerId: me.id,
    },
  });

  return NextResponse.json(song, { status: 201 });
}
