// Ciclo assíncrono do revezamento. Sem notificação, o dono só descobria uma
// proposta se recarregasse a página, e no assíncrono real (dias entre passos) a
// proposta apodrecia. Os eventos fecham o ciclo: propor avisa o dono;
// aceitar/recusar avisa quem propôs; entrega ou nova lacuna avisa quem segue.
//
// Tudo é best-effort: falha de notificação nunca pode quebrar a ação por baixo
// (aceitar uma proposta, declarar um slot), então os writers engolem o próprio
// erro.

import { prisma } from "@/lib/prisma";
import { sendNotificationEmail } from "@/lib/email";

/** URL base absoluta para os links dos e-mails (não há Request neste contexto). */
function appBase(): string {
  const env = process.env.APP_URL ?? process.env.NEXT_PUBLIC_APP_URL;
  return (env ?? "http://localhost:4000").replace(/\/$/, "");
}

// Assuntos de e-mail dos eventos diretos (createNotification).
const EMAIL_TITLES: Record<string, string> = {
  proposal_received: "Sua vez: nova proposta chegou",
  proposal_accepted: "Sua proposta foi aceita",
  proposal_rejected: "Sua proposta foi recusada",
};

export type NotificationType =
  | "proposal_received"
  | "proposal_accepted"
  | "proposal_rejected"
  | "track_progress"
  | "slot_declared";

const pluralBars = (n: number) => `${n} compasso${n === 1 ? "" : "s"}`;

type BaseInput = {
  type: NotificationType;
  songId: string;
  songTitle: string;
  actorName: string;
  trackName?: string | null;
  count?: number | null;
  message: string;
};

/** Cria uma notificação direta in-app e, se o destinatário tem e-mail
 *  verificado, também envia por e-mail — o canal durável do "sua vez".
 *  Falha em silêncio quando não há destinatário ou o banco recusa. */
async function createNotification(input: BaseInput & { userId: string | null | undefined }) {
  if (!input.userId) return;
  try {
    await prisma.notification.create({
      data: {
        userId: input.userId,
        type: input.type,
        songId: input.songId,
        songTitle: input.songTitle,
        actorName: input.actorName,
        trackName: input.trackName ?? null,
        count: input.count ?? null,
        message: input.message,
      },
    });
  } catch (e) {
    console.error("notification create failed", e);
    return;
  }

  // E-mail é best-effort: nunca bloqueia a ação que originou a notificação.
  try {
    const user = await prisma.user.findUnique({
      where: { id: input.userId },
      select: { email: true, emailVerified: true },
    });
    if (user?.email && user.emailVerified) {
      await sendNotificationEmail({
        to: user.email,
        title: EMAIL_TITLES[input.type] ?? "Novidade no attacca",
        message: input.message,
        songTitle: input.songTitle,
        url: `${appBase()}/songs/${input.songId}`,
      });
    }
  } catch (e) {
    console.error("notification email failed", e);
  }
}

/** Distribui uma notificação a quem segue a música, menos os ids excluídos. */
async function notifyWatchers(
  input: BaseInput & { exceptUserIds?: Array<string | null | undefined> },
) {
  try {
    const skip = new Set(input.exceptUserIds?.filter(Boolean) as string[]);
    const watches = await prisma.songWatch.findMany({
      where: { songId: input.songId },
      select: { userId: true },
    });
    const targets = watches.map((w) => w.userId).filter((id) => !skip.has(id));
    if (targets.length === 0) return;
    await prisma.notification.createMany({
      data: targets.map((userId) => ({
        userId,
        type: input.type,
        songId: input.songId,
        songTitle: input.songTitle,
        actorName: input.actorName,
        trackName: input.trackName ?? null,
        count: input.count ?? null,
        message: input.message,
      })),
    });
  } catch (e) {
    console.error("notifyWatchers failed", e);
  }
}

// ── Seguir uma música (SongWatch) ─────────────────────────────────────────────

/** Passa a seguir a música, de forma idempotente. Acionado automaticamente ao
 *  interagir ou pelo botão "Seguir". */
export async function watchSong(userId: string, songId: string) {
  try {
    await prisma.songWatch.upsert({
      where: { userId_songId: { userId, songId } },
      create: { userId, songId },
      update: {},
    });
  } catch (e) {
    console.error("watchSong failed", e);
  }
}

export async function unwatchSong(userId: string, songId: string) {
  await prisma.songWatch.deleteMany({ where: { userId, songId } });
}

export async function isWatching(userId: string, songId: string) {
  const w = await prisma.songWatch.findUnique({
    where: { userId_songId: { userId, songId } },
  });
  return !!w;
}

// ── Eventos de domínio ────────────────────────────────────────────────────────

/** Alguém propôs uma mudança de trilha: avisa o dono da música. */
export async function notifyProposalReceived(args: {
  ownerId: string | null;
  songId: string;
  songTitle: string;
  trackName: string;
  count: number;
  proposerId: string;
  proposerName: string;
}) {
  if (!args.ownerId || args.ownerId === args.proposerId) return; // sem dono ou é o próprio
  await createNotification({
    userId: args.ownerId,
    type: "proposal_received",
    songId: args.songId,
    songTitle: args.songTitle,
    actorName: args.proposerName,
    trackName: args.trackName,
    count: args.count,
    message: `${args.proposerName} propôs ${pluralBars(args.count)} em ${args.trackName}`,
  });
}

/** O dono aceitou ou recusou uma proposta: avisa quem propôs. */
export async function notifyProposalReviewed(args: {
  authorId: string | null;
  reviewerId: string;
  reviewerName: string;
  accepted: boolean;
  songId: string;
  songTitle: string;
  trackName: string;
  count: number;
}) {
  if (!args.authorId || args.authorId === args.reviewerId) return;
  const verb = args.accepted ? "aceitou" : "recusou";
  await createNotification({
    userId: args.authorId,
    type: args.accepted ? "proposal_accepted" : "proposal_rejected",
    songId: args.songId,
    songTitle: args.songTitle,
    actorName: args.reviewerName,
    trackName: args.trackName,
    count: args.count,
    message: `${args.reviewerName} ${verb} sua proposta em ${args.trackName}`,
  });
}

/** Uma trilha foi entregue (proposta aceita): avisa quem segue a música. */
export async function notifyTrackDelivered(args: {
  songId: string;
  songTitle: string;
  trackName: string;
  count: number;
  delivererId: string | null;
  delivererName: string;
  reviewerId: string; // o dono que aceitou; já sabe, então é excluído do fan-out
}) {
  await notifyWatchers({
    type: "track_progress",
    songId: args.songId,
    songTitle: args.songTitle,
    actorName: args.delivererName,
    trackName: args.trackName,
    count: args.count,
    message: `${args.trackName} avançou — ${args.delivererName} entregou ${pluralBars(args.count)}`,
    // Quem entregou já recebe "proposta aceita"; quem revisou fez o aceite.
    exceptUserIds: [args.delivererId, args.reviewerId],
  });
}

/** Uma nova lacuna de instrumento foi declarada: avisa quem segue a música. */
export async function notifySlotDeclared(args: {
  songId: string;
  songTitle: string;
  trackName: string;
  actorId?: string | null;
  actorName: string;
}) {
  await notifyWatchers({
    type: "slot_declared",
    songId: args.songId,
    songTitle: args.songTitle,
    actorName: args.actorName,
    trackName: args.trackName,
    message: `Agora falta ${args.trackName} — um instrumento novo para transcrever`,
    exceptUserIds: [args.actorId],
  });
}
