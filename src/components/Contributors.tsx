"use client";

import { useEffect, useState } from "react";

type Data = {
  owner: { id: string; name: string } | null;
  contributors: { key: string; name: string; isOwner: boolean }[];
};

// Reconhecimento estilo GitHub: quem construiu esta música, ou seja, o dono e
// todas as pessoas com contribuição aceita.
export default function Contributors({ songId }: { songId: string }) {
  const [data, setData] = useState<Data | null>(null);

  useEffect(() => {
    fetch(`/api/songs/${songId}/contributors`)
      .then((r) => r.json())
      .then(setData)
      .catch(() => {});
  }, [songId]);

  if (!data || (!data.owner && data.contributors.length === 0)) return null;

  const others = data.contributors.filter((c) => !c.isOwner);

  return (
    <p className="sub" style={{ marginTop: 4 }}>
      {data.owner && (
        <>
          dono: <strong>{data.owner.name}</strong>
        </>
      )}
      {others.length > 0 && (
        <> · contribuíram: {others.map((c) => c.name).join(", ")}</>
      )}
    </p>
  );
}
