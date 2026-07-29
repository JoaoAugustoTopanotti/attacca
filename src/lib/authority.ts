// Autoridade do modelo maintainer, num lugar só: o dono da música (quem a
// criou) responde pelos aceites e pelas mudanças estruturais; qualquer pessoa
// identificada propõe; música sem dono (seeds/legado) é aberta a todos os
// identificados. Antes esta regra vivia copiada em quatro módulos, com
// mensagens divergentes.

import { prisma } from "@/lib/prisma";
import type { Actor } from "@/lib/cells";

type OwnedSongShape = {
  ownerId: string | null;
  owner: { displayName: string } | null;
};

/** Lançado quando alguém que não é o dono tenta um ato de dono (HTTP 403). */
export class NotOwnerError extends Error {}

/**
 * Garante que `actor` pode agir como dono da música. `action` completa a
 * mensagem de erro: "Só Fulano (dono da música) <action>."
 */
export function assertSongOwner(
  song: OwnedSongShape,
  actor: Actor,
  action: string,
) {
  if (song.ownerId && song.ownerId !== actor.id) {
    const owner = song.owner?.displayName ?? "o dono";
    throw new NotOwnerError(`Só ${owner} (dono da música) ${action}.`);
  }
}

/** Carrega a música (com o dono) e garante que `actor` pode agir como dono. */
export async function loadOwnedSong(
  songId: string,
  actor: Actor,
  action: string,
) {
  const song = await prisma.song.findUnique({
    where: { id: songId },
    include: { owner: true },
  });
  if (!song) throw new Error("Música não encontrada.");
  assertSongOwner(song, actor, action);
  return song;
}
