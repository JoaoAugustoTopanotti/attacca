// Avisa os componentes montados quando o perfil muda (nome, e-mail,
// instrumentos). O header busca /api/me uma única vez, ao montar, e
// `router.refresh()` re-renderiza o servidor sem refazer esse fetch: sem este
// evento, o nome novo só apareceria depois de recarregar a página.

export type MeSnapshot = {
  id: string;
  displayName: string;
  email: string | null;
  instruments: string[];
};

export const ME_EVENT = "gs:me-changed";

/** Anuncia o perfil recém-salvo para os componentes já montados. */
export function emitMeChanged(me: MeSnapshot) {
  window.dispatchEvent(new CustomEvent<MeSnapshot>(ME_EVENT, { detail: me }));
}
