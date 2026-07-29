"use client";

import Link from "next/link";
import { useMemo, useState } from "react";

type Song = {
  id: string;
  title: string;
  artist: string | null;
  percent: number;
  missing: string[];
  tracks: number; // nº de trilhas declaradas
  /** Famílias GM de todas as trilhas ("Guitarra/Violão", "Baixo"). */
  families: string[];
  /** Famílias com alguma trilha incompleta: o que ainda espera uma mão. */
  openFamilies: string[];
  /** Famílias com trilha vazia (0%): o "falta X" do mural. */
  missingFamilies: string[];
};

type Preset = { key: string; label: string; family: string };

const BLOCKS = 14;

/** Sentinela do chip "Outros": qualquer família importada fora dos presets. */
const OTHER = "__outros__";

/** Busca acento-insensível: "orgao" acha "Órgão". */
function fold(s: string) {
  return s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
}

/** Barra de progresso em blocos, a assinatura visual da marca.
 *  Tinta = feito, vermelhão = a borda viva onde a próxima mão entra,
 *  cinza = ainda não começou. */
function BlockBar({ percent }: { percent: number }) {
  const done = Math.round((percent / 100) * BLOCKS);
  return (
    <span className="blockbar" aria-hidden="true">
      {Array.from({ length: BLOCKS }, (_, i) => (
        <i
          key={i}
          className={i < done ? "done" : i === done && percent < 100 ? "edge" : ""}
        />
      ))}
    </span>
  );
}

function MuralRow({
  song,
  mode,
  needsYou,
}: {
  song: Song;
  mode: "tocar" | "colaborar";
  needsYou: boolean;
}) {
  const hasGrid = song.tracks > 0;
  const complete = hasGrid && song.percent >= 100;
  const action =
    mode === "tocar"
      ? { label: "Tocar →", go: false }
      : { label: song.percent === 0 ? "Assumir →" : "Continuar daqui →", go: true };

  return (
    <Link href={`/songs/${song.id}`} className="mural-row">
      <span className="mural-main">
        <span>
          <span className="mural-title">{song.title}</span>
          {song.artist && <span className="mural-artist">{song.artist}</span>}
          {needsYou && (
            <span className="collab-you">precisa do seu instrumento</span>
          )}
        </span>
        <span className={`mural-act ${action.go ? "go" : ""}`}>{action.label}</span>
      </span>
      <span className="mural-prog">
        <BlockBar percent={hasGrid ? song.percent : 0} />
        <span className={`mural-pct ${!hasGrid || complete ? "dim" : ""}`}>
          {hasGrid ? `${song.percent}%` : "—"}
        </span>
        {complete ? (
          <span className="mural-miss done">✓ completa</span>
        ) : !hasGrid ? (
          <span className="mural-miss">ninguém começou ainda — envie um arquivo ou comece do zero</span>
        ) : song.missing.length > 0 ? (
          <span className="mural-miss">
            falta alguém em:{" "}
            {song.missing.map((m, i) => (
              <span key={m}>
                {i > 0 && " · "}
                <span className="mi">{m}</span>
              </span>
            ))}
          </span>
        ) : song.percent === 0 ? (
          <span className="mural-miss">ninguém começou — seja a primeira mão</span>
        ) : null}
      </span>
    </Link>
  );
}

export default function HomeTabs({
  tocar,
  colaborar,
  presets,
  myInstruments,
}: {
  tocar: Song[];
  colaborar: Song[];
  presets: Preset[];
  /** null = pessoa não identificada: sem tags e sem "precisa de você". */
  myInstruments: string[] | null;
}) {
  const [tab, setTab] = useState<"tocar" | "colaborar">("tocar");
  const [query, setQuery] = useState("");
  const [activeFamilies, setActiveFamilies] = useState<string[]>([]);
  const [onlyNeedsYou, setOnlyNeedsYou] = useState(false);
  const total = tocar.length + colaborar.length;

  // "Falta baixo" só vira convite quando chega a quem toca baixo: uma trilha
  // vazia de instrumento que a pessoa declarou é um chamado direto a ela.
  const myFamilies = useMemo(() => {
    const set = new Set<string>();
    for (const k of myInstruments ?? []) {
      const family = presets.find((p) => p.key === k)?.family;
      if (family) set.add(family);
    }
    return set;
  }, [myInstruments, presets]);

  const needsYou = (song: Song) =>
    song.missingFamilies.some((f) => myFamilies.has(f));

  // Só entram chips de famílias presentes no mural: filtro que não filtra nada
  // é ruído. O vocabulário é o dos presets; famílias importadas fora da lista
  // (metais, sopros) caem num único chip "Outros".
  const knownFamilies = useMemo(() => new Set(presets.map((p) => p.family)), [presets]);
  const chips = useMemo(() => {
    const inData = new Set<string>();
    for (const s of [...tocar, ...colaborar]) {
      for (const f of s.families) inData.add(f);
    }
    const labels = new Map<string, string>();
    for (const p of presets) if (!labels.has(p.family)) labels.set(p.family, p.label);
    const known = [...inData]
      .filter((f) => knownFamilies.has(f))
      .map((family) => ({ family, label: labels.get(family) ?? family }))
      .sort((a, b) => a.label.localeCompare(b.label, "pt"));
    const hasOther = [...inData].some((f) => !knownFamilies.has(f));
    return hasOther ? [...known, { family: OTHER, label: "Outros" }] : known;
  }, [tocar, colaborar, presets, knownFamilies]);

  function toggleFamily(family: string) {
    setActiveFamilies((cur) =>
      cur.includes(family) ? cur.filter((f) => f !== family) : [...cur, family],
    );
  }

  const q = fold(query.trim());
  // Sem instrumentos declarados o chip "precisa de você" some, e o filtro não
  // pode seguir ativo de forma invisível.
  const needsYouOn = onlyNeedsYou && myFamilies.size > 0;
  const filtering = q !== "" || activeFamilies.length > 0 || needsYouOn;

  function applyFilters(songs: Song[], mode: "tocar" | "colaborar") {
    return songs.filter((song) => {
      if (q && !fold(`${song.title} ${song.artist ?? ""}`).includes(q)) return false;
      if (activeFamilies.length > 0) {
        // Em Tocar, o chip significa "tem esse instrumento"; em Colaborar,
        // "esse instrumento ainda espera uma mão".
        const pool = mode === "tocar" ? song.families : song.openFamilies;
        const match = activeFamilies.some((f) =>
          f === OTHER ? pool.some((x) => !knownFamilies.has(x)) : pool.includes(f),
        );
        if (!match) return false;
      }
      if (mode === "colaborar" && needsYouOn && !needsYou(song)) return false;
      return true;
    });
  }

  const tocarShown = applyFilters(tocar, "tocar");
  const colaborarShown = applyFilters(colaborar, "colaborar").sort(
    (a, b) => Number(needsYou(b)) - Number(needsYou(a)),
  );
  const shown = tab === "tocar" ? tocarShown : colaborarShown;
  const inTab = tab === "tocar" ? tocar : colaborar;

  function clearFilters() {
    setQuery("");
    setActiveFamilies([]);
    setOnlyNeedsYou(false);
  }

  return (
    <>
      <div className="mural-intro">
        <p className="mural-slogan">
          Alguém começa. <span className="b">Você continua.</span>
        </p>
        <p className="mural-sub">Continue de onde outro músico parou.</p>
        <p className="mural-count mural-meta">
          <span>
            <b>{total}</b> música{total === 1 ? "" : "s"} · <b>{colaborar.length}</b>{" "}
            esperando uma mão
          </span>
        </p>
      </div>

      <div className="tabs-bar">
        <div className="tabs">
          <button
            className={`tab ${tab === "tocar" ? "active" : ""}`}
            onClick={() => setTab("tocar")}
          >
            Tocar
          </button>
          <button
            className={`tab ${tab === "colaborar" ? "active" : ""}`}
            onClick={() => setTab("colaborar")}
          >
            Colaborar
          </button>
        </div>
        <Link href="/songs/new" className="btn-new-collab">
          + nova música
        </Link>
      </div>

      {/* ── Filtros ── */}
      <div className="mural-filters">
        <div className="mural-filters-row">
          <input
            type="text"
            className="mural-search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="buscar por título ou artista…"
            aria-label="Buscar música"
          />
          <div className="filter-chips">
            {tab === "colaborar" && myFamilies.size > 0 && (
              <button
                type="button"
                className={`filter-chip you ${onlyNeedsYou ? "on" : ""}`}
                aria-pressed={onlyNeedsYou}
                onClick={() => setOnlyNeedsYou((v) => !v)}
              >
                precisa de você
              </button>
            )}
            {chips.map((c) => {
              const on = activeFamilies.includes(c.family);
              return (
                <button
                  key={c.family}
                  type="button"
                  className={`filter-chip ${on ? "on" : ""}`}
                  aria-pressed={on}
                  onClick={() => toggleFamily(c.family)}
                >
                  {c.label}
                </button>
              );
            })}
          </div>
        </div>
        {filtering && (
          <p className="mural-filter-count">
            mostrando <b>{shown.length}</b> de {inTab.length} ·{" "}
            <button type="button" className="mural-filter-clear" onClick={clearFilters}>
              limpar filtros
            </button>
          </p>
        )}
      </div>

      {/* ── Aba Tocar ── */}
      {tab === "tocar" && (
        <div className="mural-list">
          {tocar.length === 0 ? (
            <p className="mural-empty">
              nenhuma música completa ainda — em <strong>Colaborar</strong> tem
              transcrição esperando uma mão.
            </p>
          ) : tocarShown.length === 0 ? (
            <p className="mural-empty">
              nada bate com os filtros —{" "}
              <button type="button" className="mural-empty-clear" onClick={clearFilters}>
                limpar
              </button>
              .
            </p>
          ) : (
            tocarShown.map((song) => (
              <MuralRow key={song.id} song={song} mode="tocar" needsYou={needsYou(song)} />
            ))
          )}
        </div>
      )}

      {/* ── Aba Colaborar ── */}
      {tab === "colaborar" && (
        <div className="mural-list">
          {colaborar.length === 0 ? (
            <p className="mural-empty">
              todas as músicas estão completas —{" "}
              <Link href="/songs/new">comece uma nova</Link>.
            </p>
          ) : colaborarShown.length === 0 ? (
            <p className="mural-empty">
              nada bate com os filtros —{" "}
              <button type="button" className="mural-empty-clear" onClick={clearFilters}>
                limpar
              </button>
              .
            </p>
          ) : (
            colaborarShown.map((song) => (
              <MuralRow
                key={song.id}
                song={song}
                mode="colaborar"
                needsYou={needsYou(song)}
              />
            ))
          )}
        </div>
      )}

      <footer className="mural-foot">
        <p className="mural-eth">Uma transcrição incompleta é um convite para contribuir.</p>
      </footer>
    </>
  );
}
