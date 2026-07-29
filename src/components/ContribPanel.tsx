"use client";

import { useEffect, useState } from "react";

type Contributor = { key: string; name: string; isOwner: boolean };
type Data = {
  owner: { id: string; name: string } | null;
  contributors: Contributor[];
};

export default function ContribPanel({ songId }: { songId: string }) {
  const [data, setData] = useState<Data | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    fetch(`/api/songs/${songId}/contributors`)
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
      .then(setData)
      .catch(() => setFailed(true));
  }, [songId]);

  if (!data) {
    return (
      <div className="contrib-panel">
        <p className="sub">
          {failed ? "Não foi possível carregar os contribuidores." : "Carregando…"}
        </p>
      </div>
    );
  }

  if (!data.owner && data.contributors.length === 0) {
    return (
      <div className="contrib-panel">
        <p className="sub">Nenhum contribuidor registrado ainda.</p>
      </div>
    );
  }

  const others = data.contributors.filter((c) => !c.isOwner);

  return (
    <div className="contrib-panel contrib-panel--scroll">
      <p className="sub" style={{ marginBottom: 20 }}>
        Pessoas que moldaram esta transcrição.
      </p>
      <ul className="contrib-list">
        {data.owner && (
          <li className="contrib-item">
            <span className="contrib-avatar">
              {data.owner.name[0]?.toUpperCase() ?? "?"}
            </span>
            <span className="contrib-name">{data.owner.name}</span>
            <span className="contrib-role">Criador</span>
          </li>
        )}
        {others.map((c) => (
          <li key={c.key} className="contrib-item">
            <span className="contrib-avatar">
              {c.name[0]?.toUpperCase() ?? "?"}
            </span>
            <span className="contrib-name">{c.name}</span>
            <span className="contrib-role">Contribuidor</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
