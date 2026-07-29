// Converte o título de uma música num slug de URL. A unicidade é garantida por
// quem chama, que acrescenta um sufixo curto em caso de colisão.

export function slugify(input: string): string {
  const base = input
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "") // remove os acentos combinantes
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return base || "song";
}
