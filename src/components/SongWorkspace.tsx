// SongWorkspace — the active component logic was moved to:
//   PlayerPanel.tsx  (player tab, full-width)
//   CollabPanel.tsx  (upload + history tab)
//   ContribPanel.tsx (contributors tab)
// This file is kept only as a re-export for the RevisionDTO type so that
// existing imports from SongPage still compile.
export type { RevisionDTO } from "@/lib/song-types";
