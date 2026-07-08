// Async loop — the relay must not depend on luck (someone reloading a tab).
// In-app notifications close it: propose → owner is told; accept/reject → the
// proposer is told; a delivery or a new gap → the song's followers are told.
//
// No email/push yet: that arrives with the magic-link identity upgrade (ADR
// 0003). Everything here is best-effort — a notification failure must NEVER
// break the underlying action (accepting a proposal, declaring a slot). So the
// low-level writers swallow their own errors.

import { prisma } from "@/lib/prisma";
import { sendNotificationEmail } from "@/lib/email";

/** Absolute base URL for links inside emails (no Request in this context). */
function appBase(): string {
  const env = process.env.APP_URL ?? process.env.NEXT_PUBLIC_APP_URL;
  return (env ?? "http://localhost:4000").replace(/\/$/, "");
}

// Human email subjects for the direct (createNotification) events.
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

/** Low-level: create one direct notification (in-app) and, when the recipient
 *  has a verified email, also send it by email — the durable "sua vez" channel.
 *  Skips silently on missing target/errors. */
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

  // Best-effort email — never blocks the underlying action.
  try {
    const user = await prisma.user.findUnique({
      where: { id: input.userId },
      select: { email: true, emailVerified: true },
    });
    if (user?.email && user.emailVerified) {
      await sendNotificationEmail({
        to: user.email,
        title: EMAIL_TITLES[input.type] ?? "Novidade no GitSong",
        message: input.message,
        songTitle: input.songTitle,
        url: `${appBase()}/songs/${input.songId}`,
      });
    }
  } catch (e) {
    console.error("notification email failed", e);
  }
}

/** Fan a notification out to every follower of a song, minus the excluded ids. */
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

// ── Follow (SongWatch) ──────────────────────────────────────────────────────

/** Idempotent follow — auto on interaction or via the explicit "Seguir" button. */
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

// ── Domain events ───────────────────────────────────────────────────────────

/** Scenario 1: a collaborator proposed a track change → tell the song owner. */
export async function notifyProposalReceived(args: {
  ownerId: string | null;
  songId: string;
  songTitle: string;
  trackName: string;
  count: number;
  proposerId: string;
  proposerName: string;
}) {
  if (!args.ownerId || args.ownerId === args.proposerId) return; // no owner / self
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

/** Scenario 2: the owner accepted or rejected a proposal → tell the proposer. */
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

/** Scenario 3a: a track was delivered (proposal accepted) → tell the followers. */
export async function notifyTrackDelivered(args: {
  songId: string;
  songTitle: string;
  trackName: string;
  count: number;
  delivererId: string | null;
  delivererName: string;
  reviewerId: string; // the owner who accepted — already knows
}) {
  await notifyWatchers({
    type: "track_progress",
    songId: args.songId,
    songTitle: args.songTitle,
    actorName: args.delivererName,
    trackName: args.trackName,
    count: args.count,
    message: `${args.trackName} avançou — ${args.delivererName} entregou ${pluralBars(args.count)}`,
    // The deliverer gets a "proposal_accepted"; the reviewer did the accepting.
    exceptUserIds: [args.delivererId, args.reviewerId],
  });
}

/** Scenario 3b: a new instrument gap was declared → tell the followers. */
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
