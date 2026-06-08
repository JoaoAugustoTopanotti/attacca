// Turn a song title into a URL-friendly slug. Uniqueness is enforced by the
// caller (it appends a short suffix on collision).

export function slugify(input: string): string {
  const base = input
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "") // strip combining accent marks
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return base || "song";
}
