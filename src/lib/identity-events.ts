// O perfil mudou (nome, e-mail, instrumentos) → quem mostra a identidade na tela
// precisa saber na hora. O header busca /api/me uma vez, ao montar; um
// router.refresh() re-renderiza o servidor mas não refaz esse fetch — então quem
// salvava nas configurações só via o nome novo depois de um F5.

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
