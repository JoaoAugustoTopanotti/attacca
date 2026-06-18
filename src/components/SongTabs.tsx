"use client";

import { useState } from "react";
import Link from "next/link";
import SongWorkspace, { type RevisionDTO } from "@/components/SongWorkspace";
import CompletenessPanel from "@/components/CompletenessPanel";

type Tab = "player" | "completude";

export default function SongTabs({
  songId,
  initialRevisions,
}: {
  songId: string;
  initialRevisions: RevisionDTO[];
}) {
  const [active, setActive] = useState<Tab>("player");

  return (
    <div>
      <nav className="song-tabs">
        <button
          type="button"
          className={`tab${active === "player" ? " active" : ""}`}
          onClick={() => setActive("player")}
        >
          Player
          {initialRevisions.length > 0 && (
            <span className="tab-count">{initialRevisions.length}</span>
          )}
        </button>
        <button
          type="button"
          className={`tab${active === "completude" ? " active" : ""}`}
          onClick={() => setActive("completude")}
        >
          Completude
        </button>
        <Link href={`/songs/${songId}/edit`} className="tab">
          Editar
        </Link>
        <Link href={`/songs/${songId}/compare`} className="tab">
          Comparar
        </Link>
      </nav>

      {active === "player" && (
        <SongWorkspace songId={songId} initialRevisions={initialRevisions} />
      )}
      {active === "completude" && <CompletenessPanel songId={songId} />}
    </div>
  );
}
