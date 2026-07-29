"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  DEFAULT_PLAYER_PREFS,
  readPlayerPrefs,
  writePlayerPrefs,
  type PlayerPrefs,
} from "@/lib/player-prefs";
import type { AccountOverview } from "@/lib/profile";
import { emitMeChanged, type MeSnapshot } from "@/lib/identity-events";
import { applyTheme, readTheme, type Theme } from "@/lib/theme";

type Preset = { key: string; label: string };

export default function SettingsClient({
  user,
  presets,
}: {
  user: MeSnapshot;
  presets: Preset[];
}) {
  // Cópia local do perfil salvo. Cada save a atualiza (para o botão voltar a
  // ficar inerte) e avisa o header, que mostra o nome, sem exigir recarregar.
  const [me, setMe] = useState<MeSnapshot>(user);

  function onSaved(next: MeSnapshot) {
    setMe(next);
    emitMeChanged(next);
  }

  return (
    <div className="settings">
      <h1 className="settings-title">Configurações</h1>
      <ProfileSection savedName={me.displayName} onSaved={onSaved} />
      <EmailSection currentEmail={me.email} />
      <InstrumentsSection
        presets={presets}
        savedInstruments={me.instruments}
        onSaved={onSaved}
      />
      <AppearanceSection />
      <PlaybackSection />
      <AccountSection />
    </div>
  );
}

// ── Perfil ──────────────────────────────────────────────────────────────────

function ProfileSection({
  savedName,
  onSaved,
}: {
  savedName: string;
  onSaved: (me: MeSnapshot) => void;
}) {
  const router = useRouter();
  const [name, setName] = useState(savedName);
  const [saving, setSaving] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const dirty = name.trim() !== savedName;

  async function save() {
    setSaving(true);
    setError(null);
    setFeedback(null);
    const res = await fetch("/api/me", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ displayName: name }),
    });
    const data = await res.json().catch(() => ({}));
    setSaving(false);
    if (!res.ok) {
      setError(data.error ?? "Não foi possível salvar.");
      return;
    }
    setName(data.displayName);
    onSaved(data);
    setFeedback("Nome atualizado.");
    // O nome também assina as contribuições renderizadas no servidor, então a
    // página precisa ser revalidada.
    router.refresh();
  }

  return (
    <section className="settings-card">
      <h2>Perfil</h2>
      <p className="sub settings-hint">
        É este nome que assina cada trecho que você transcreve — ele aparece nas
        suas contribuições, propostas e no histórico da música. Mudar aqui atualiza
        também o que já ficou para trás.
      </p>
      <label className="settings-field">
        <span>Nome de exibição</span>
        <input
          type="text"
          value={name}
          maxLength={40}
          onChange={(e) => setName(e.target.value)}
          placeholder="Como você quer ser creditado"
        />
      </label>
      <div className="settings-actions">
        <button type="button" onClick={save} disabled={!dirty || saving}>
          {saving ? "Salvando…" : "Salvar"}
        </button>
        {feedback && <span className="settings-ok">{feedback}</span>}
        {error && <span className="settings-error">{error}</span>}
      </div>
    </section>
  );
}

// ── E-mail ──────────────────────────────────────────────────────────────────

function EmailSection({ currentEmail }: { currentEmail: string | null }) {
  const [email, setEmail] = useState("");
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState<string | null>(null);
  const [devUrl, setDevUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [changed, setChanged] = useState(false);

  // Retorno do link de confirmação: o e-mail só troca depois de comprovado.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get("email") === "changed") {
      setChanged(true);
      params.delete("email");
      const qs = params.toString();
      window.history.replaceState({}, "", window.location.pathname + (qs ? `?${qs}` : ""));
    }
  }, []);

  async function requestChange() {
    setSending(true);
    setError(null);
    setSent(null);
    setDevUrl(null);
    const res = await fetch("/api/me/email", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email }),
    });
    const data = await res.json().catch(() => ({}));
    setSending(false);
    if (!res.ok) {
      setError(data.error ?? "Não foi possível enviar o link.");
      return;
    }
    setSent(email);
    setDevUrl(data.devUrl ?? null);
    setEmail("");
  }

  return (
    <section className="settings-card">
      <h2>E-mail</h2>
      <p className="sub settings-hint">
        Seu e-mail é a âncora da sua identidade: é por ele que você reentra em
        outro aparelho sem perder a autoria do que já fez — e é por ele que chega
        o aviso de que é a sua vez.
      </p>

      {changed && <p className="settings-ok settings-banner">E-mail confirmado e atualizado.</p>}

      <div className="settings-current">
        {currentEmail ? (
          <>
            <strong>{currentEmail}</strong>
            <span className="settings-badge">verificado</span>
          </>
        ) : (
          <span className="sub">Nenhum e-mail ainda — sua conta só existe neste navegador.</span>
        )}
      </div>

      <label className="settings-field">
        <span>{currentEmail ? "Trocar para" : "Definir e-mail"}</span>
        <input
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="voce@exemplo.com"
        />
      </label>
      <div className="settings-actions">
        <button type="button" onClick={requestChange} disabled={!email.trim() || sending}>
          {sending ? "Enviando…" : "Enviar link de confirmação"}
        </button>
        {error && <span className="settings-error">{error}</span>}
      </div>

      {sent && (
        <p className="sub settings-hint">
          Enviamos um link para <strong>{sent}</strong>. O e-mail só muda depois que
          você abrir esse link — até lá, nada é alterado.
          {devUrl && (
            <>
              {" "}
              <a href={devUrl}>Abrir link (dev)</a>
            </>
          )}
        </p>
      )}
    </section>
  );
}

// ── Instrumentos ────────────────────────────────────────────────────────────

function InstrumentsSection({
  presets,
  savedInstruments,
  onSaved,
}: {
  presets: Preset[];
  savedInstruments: string[];
  onSaved: (me: MeSnapshot) => void;
}) {
  const router = useRouter();
  const [selected, setSelected] = useState<string[]>(savedInstruments);
  const [saving, setSaving] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const dirty =
    selected.length !== savedInstruments.length ||
    selected.some((k) => !savedInstruments.includes(k));

  function toggle(key: string) {
    setSelected((cur) =>
      cur.includes(key) ? cur.filter((k) => k !== key) : [...cur, key],
    );
    setFeedback(null);
  }

  async function save() {
    setSaving(true);
    setError(null);
    setFeedback(null);
    const res = await fetch("/api/me", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ instruments: selected }),
    });
    const data = await res.json().catch(() => ({}));
    setSaving(false);
    if (!res.ok) {
      setError(data.error ?? "Não foi possível salvar.");
      return;
    }
    setSelected(data.instruments);
    onSaved(data);
    setFeedback("Instrumentos atualizados.");
    // O mural é um server component e usa os instrumentos para marcar "precisa
    // do seu instrumento": revalida para ele já vir certo na próxima navegação.
    router.refresh();
  }

  return (
    <section className="settings-card">
      <h2>Instrumentos que eu toco</h2>
      <p className="sub settings-hint">
        O mural usa isso para destacar as músicas que estão esperando justamente o
        seu instrumento — “falta baixo” só vira convite quando chega em quem toca
        baixo.
      </p>
      <div className="settings-chips">
        {presets.map((p) => {
          const on = selected.includes(p.key);
          return (
            <button
              key={p.key}
              type="button"
              className={`settings-chip ${on ? "on" : ""}`}
              aria-pressed={on}
              onClick={() => toggle(p.key)}
            >
              {p.label}
            </button>
          );
        })}
      </div>
      <div className="settings-actions">
        <button type="button" onClick={save} disabled={!dirty || saving}>
          {saving ? "Salvando…" : "Salvar"}
        </button>
        {feedback && <span className="settings-ok">{feedback}</span>}
        {error && <span className="settings-error">{error}</span>}
      </div>
    </section>
  );
}

// ── Aparência (preferência local, no localStorage) ──────────────────────────

function AppearanceSection() {
  const [theme, setTheme] = useState<Theme | null>(null);

  // Só após a montagem: o localStorage não existe no servidor.
  useEffect(() => setTheme(readTheme()), []);

  function change(next: Theme) {
    setTheme(applyTheme(next));
  }

  if (!theme) return null;

  return (
    <section className="settings-card">
      <h2>Aparência</h2>
      <p className="sub settings-hint">
        Vale para este navegador. O tema escuro é o padrão do attacca.
      </p>
      <label className="settings-field">
        <span>Tema</span>
        <select value={theme} onChange={(e) => change(e.target.value as Theme)}>
          <option value="dark">Escuro (padrão)</option>
          <option value="light">Claro</option>
        </select>
      </label>
    </section>
  );
}

// ── Reprodução (preferências locais, no localStorage) ───────────────────────

function PlaybackSection() {
  const [prefs, setPrefs] = useState<PlayerPrefs | null>(null);

  // Só após a montagem: o localStorage não existe no servidor.
  useEffect(() => setPrefs(readPlayerPrefs()), []);

  function update(patch: Partial<PlayerPrefs>) {
    setPrefs((cur) => (cur ? writePlayerPrefs({ ...cur, ...patch }) : cur));
  }

  if (!prefs) return null;

  return (
    <section className="settings-card">
      <h2>Reprodução e leitura</h2>
      <p className="sub settings-hint">
        Vale para este navegador e é aplicado na hora, inclusive num player já
        aberto em outra aba desta sessão.
      </p>

      <label className="settings-field">
        <span>Notação</span>
        <select
          value={prefs.staveProfile}
          onChange={(e) =>
            update({ staveProfile: e.target.value as PlayerPrefs["staveProfile"] })
          }
        >
          <option value="Tab">Só tablatura</option>
          <option value="ScoreTab">Partitura + tablatura</option>
        </select>
      </label>

      <RangeField
        label="Zoom da tablatura"
        value={prefs.scale}
        min={0.7}
        max={2}
        step={0.05}
        format={(v) => `${Math.round(v * 100)}%`}
        onChange={(scale) => update({ scale })}
      />
      <RangeField
        label="Velocidade padrão"
        value={prefs.speed}
        min={0.25}
        max={2}
        step={0.05}
        format={(v) => `${v.toFixed(2)}×`}
        onChange={(speed) => update({ speed })}
      />
      <RangeField
        label="Volume"
        value={prefs.volume}
        min={0}
        max={1}
        step={0.05}
        format={(v) => `${Math.round(v * 100)}%`}
        onChange={(volume) => update({ volume })}
      />

      <label className="settings-check">
        <input
          type="checkbox"
          checked={prefs.metronome}
          onChange={(e) => update({ metronome: e.target.checked })}
        />
        <span>Metrônomo audível</span>
      </label>
      <label className="settings-check">
        <input
          type="checkbox"
          checked={prefs.countIn}
          onChange={(e) => update({ countIn: e.target.checked })}
        />
        <span>Compasso de contagem antes de tocar</span>
      </label>

      <div className="settings-actions">
        <button
          type="button"
          className="secondary"
          onClick={() => setPrefs(writePlayerPrefs(DEFAULT_PLAYER_PREFS))}
        >
          Restaurar padrões
        </button>
      </div>
    </section>
  );
}

function RangeField({
  label,
  value,
  min,
  max,
  step,
  format,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  format: (v: number) => string;
  onChange: (v: number) => void;
}) {
  return (
    <label className="settings-field settings-field--range">
      <span>
        {label} <em>{format(value)}</em>
      </span>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
      />
    </label>
  );
}

// ── Conta: minhas músicas, quem eu sigo e as propostas em aberto ────────────

function AccountSection() {
  const [data, setData] = useState<AccountOverview | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/me/overview")
      .then((r) => (r.ok ? r.json() : null))
      .then(setData)
      .finally(() => setLoading(false));
  }, []);

  async function unfollow(songId: string) {
    await fetch(`/api/songs/${songId}/watch`, { method: "DELETE" });
    setData((cur) =>
      cur ? { ...cur, following: cur.following.filter((s) => s.id !== songId) } : cur,
    );
  }

  if (loading) return <section className="settings-card">Carregando sua conta…</section>;
  if (!data) return null;

  const nothing =
    data.owned.length === 0 &&
    data.following.length === 0 &&
    data.proposalsSent.length === 0 &&
    data.proposalsReceived.length === 0;

  return (
    <section className="settings-card">
      <h2>Minha conta</h2>

      {nothing && (
        <p className="sub settings-hint">
          Você ainda não criou nem segue nenhuma música.{" "}
          <Link href="/">Veja o mural</Link> e escolha uma para continuar.
        </p>
      )}

      {data.proposalsReceived.length > 0 && (
        <div className="settings-group">
          <h3>Esperando por você</h3>
          <ul className="settings-list">
            {data.proposalsReceived.map((p, i) => (
              <li key={`${p.songId}-${p.trackName}-${i}`}>
                <Link href={`/songs/${p.songId}#propostas`}>
                  {p.authorName} propôs {p.count} compasso{p.count === 1 ? "" : "s"} em{" "}
                  {p.trackName} — {p.songTitle}
                </Link>
              </li>
            ))}
          </ul>
        </div>
      )}

      {data.proposalsSent.length > 0 && (
        <div className="settings-group">
          <h3>Suas propostas em aberto</h3>
          <ul className="settings-list">
            {data.proposalsSent.map((p, i) => (
              <li key={`${p.songId}-${p.trackName}-${i}`}>
                <Link href={`/songs/${p.songId}#propostas`}>
                  {p.trackName} em {p.songTitle}
                </Link>{" "}
                <span className="sub">
                  · {p.count} compasso{p.count === 1 ? "" : "s"} · aguardando o dono
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {data.owned.length > 0 && (
        <div className="settings-group">
          <h3>Minhas músicas</h3>
          <ul className="settings-list">
            {data.owned.map((s) => (
              <li key={s.id}>
                <Link href={`/songs/${s.id}`}>{s.title}</Link>{" "}
                <span className="sub">
                  {s.artist ? `· ${s.artist} ` : ""}· {s.percent}% completa
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {data.following.length > 0 && (
        <div className="settings-group">
          <h3>Seguindo</h3>
          <ul className="settings-list">
            {data.following.map((s) => (
              <li key={s.id}>
                <Link href={`/songs/${s.id}`}>{s.title}</Link>{" "}
                <span className="sub">
                  {s.artist ? `· ${s.artist} ` : ""}· {s.percent}% completa
                </span>
                <button
                  type="button"
                  className="settings-unfollow"
                  onClick={() => unfollow(s.id)}
                >
                  Deixar de seguir
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}
