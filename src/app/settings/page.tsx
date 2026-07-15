import { getCurrentUser } from "@/lib/identity";
import { INSTRUMENT_PRESETS } from "@/lib/tracks";
import SettingsClient from "@/components/SettingsClient";

export const dynamic = "force-dynamic";

export const metadata = { title: "Configurações — attacca" };

export default async function SettingsPage() {
  const user = await getCurrentUser();

  if (!user) {
    return (
      <div className="empty-state">
        <p>Entre para acessar suas configurações.</p>
        <p className="sub">Use o botão “Entrar” no topo da página.</p>
      </div>
    );
  }

  return (
    <SettingsClient
      user={{
        id: user.id,
        displayName: user.displayName,
        email: user.email,
        instruments: user.instruments,
      }}
      presets={INSTRUMENT_PRESETS.map((p) => ({ key: p.key, label: p.label }))}
    />
  );
}
