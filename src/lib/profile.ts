// Settings — the person's own record: name, instruments, and the account view
// ("o que está esperando por mim").
//
// Renaming is not a cosmetic update: authorship-per-piece is the differential, so
// the display name is denormalized into CellContribution.authorName (and
// Track.ownerName) for cheap rendering. If we only touched User.displayName, the
// old name would stay frozen on every past contribution and one person would read
// as two. So a rename rewrites those caches too — the authorId/ownerId links are
// the truth, the names just follow.

import { prisma } from "@/lib/prisma";
import { INSTRUMENT_PRESETS, songCompleteness } from "@/lib/tracks";

const NAME_MIN = 2;
const NAME_MAX = 40;

export type ProfileInput = {
  displayName?: string;
  instruments?: string[];
};

/** Update the current person's profile. Throws with a user-facing message. */
export async function updateProfile(userId: string, input: ProfileInput) {
  const data: { displayName?: string; instruments?: string[] } = {};

  if (input.displayName !== undefined) {
    const name = input.displayName.trim().replace(/\s+/g, " ");
    if (name.length < NAME_MIN || name.length > NAME_MAX) {
      throw new Error(`O nome precisa ter entre ${NAME_MIN} e ${NAME_MAX} caracteres.`);
    }
    data.displayName = name;
  }

  if (input.instruments !== undefined) {
    const known = new Set(INSTRUMENT_PRESETS.map((p) => p.key));
    const unknown = input.instruments.find((k) => !known.has(k));
    if (unknown) throw new Error(`Instrumento desconhecido: ${unknown}`);
    data.instruments = [...new Set(input.instruments)];
  }

  if (Object.keys(data).length === 0) {
    return prisma.user.findUniqueOrThrow({ where: { id: userId } });
  }

  const user = await prisma.user.update({ where: { id: userId }, data });

  if (data.displayName) {
    await prisma.$transaction([
      prisma.cellContribution.updateMany({
        where: { authorId: userId },
        data: { authorName: data.displayName },
      }),
      prisma.track.updateMany({
        where: { ownerId: userId },
        data: { ownerName: data.displayName },
      }),
    ]);
  }

  return user;
}

// ── Account overview ────────────────────────────────────────────────────────

export type SongBrief = {
  id: string;
  title: string;
  artist: string | null;
  percent: number;
};

export type ProposalBrief = {
  songId: string;
  songTitle: string;
  trackName: string;
  authorName: string;
  count: number; // bars in the proposal
};

export type AccountOverview = {
  owned: SongBrief[];
  following: SongBrief[];
  /** Proposals I sent that nobody has reviewed yet. */
  proposalsSent: ProposalBrief[];
  /** Proposals waiting for ME (I own the song) — the "sua vez". */
  proposalsReceived: ProposalBrief[];
};

/** Group pending contributions into one entry per (song, track, author). */
function groupProposals(
  rows: {
    authorName: string;
    cell: { songId: string; song: { title: string }; track: { id: string; name: string } };
  }[],
): ProposalBrief[] {
  const byKey = new Map<string, ProposalBrief>();
  for (const row of rows) {
    const key = `${row.cell.track.id}::${row.authorName}`;
    const entry = byKey.get(key);
    if (entry) {
      entry.count += 1;
    } else {
      byKey.set(key, {
        songId: row.cell.songId,
        songTitle: row.cell.song.title,
        trackName: row.cell.track.name,
        authorName: row.authorName,
        count: 1,
      });
    }
  }
  return [...byKey.values()];
}

const PROPOSAL_SELECT = {
  authorName: true,
  cell: {
    select: {
      songId: true,
      song: { select: { title: true } },
      track: { select: { id: true, name: true } },
    },
  },
} as const;

export async function accountOverview(userId: string): Promise<AccountOverview> {
  const [ownedSongs, watches, sent, received] = await Promise.all([
    prisma.song.findMany({
      where: { ownerId: userId },
      orderBy: { updatedAt: "desc" },
      select: { id: true, title: true, artist: true },
    }),
    prisma.songWatch.findMany({
      where: { userId },
      orderBy: { createdAt: "desc" },
      select: { song: { select: { id: true, title: true, artist: true, ownerId: true } } },
    }),
    prisma.cellContribution.findMany({
      where: { authorId: userId, status: "proposed" },
      select: PROPOSAL_SELECT,
    }),
    prisma.cellContribution.findMany({
      where: {
        status: "proposed",
        authorId: { not: userId },
        cell: { song: { ownerId: userId } },
      },
      select: PROPOSAL_SELECT,
    }),
  ]);

  // A song I own already shows up under "minhas músicas" — don't list it twice.
  const followingSongs = watches.map((w) => w.song).filter((s) => s.ownerId !== userId);

  const withPercent = async (
    songs: { id: string; title: string; artist: string | null }[],
  ): Promise<SongBrief[]> =>
    Promise.all(
      songs.map(async (s) => ({
        id: s.id,
        title: s.title,
        artist: s.artist,
        percent: (await songCompleteness(s.id)).percent,
      })),
    );

  const [owned, following] = await Promise.all([
    withPercent(ownedSongs),
    withPercent(followingSongs),
  ]);

  return {
    owned,
    following,
    proposalsSent: groupProposals(sent),
    proposalsReceived: groupProposals(received),
  };
}
