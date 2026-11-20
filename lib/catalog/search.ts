// Text normalization shared by what we index (titles.search_text) and what we search for, so
// "Pokémon", "POKEMON" and "pokemon" all meet. Lowercase, accents stripped, punctuation to spaces.
export function normalizeSearch(text: string): string {
  return text
    .normalize("NFKD")
    .replace(/\p{M}+/gu, "")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();
}

export function searchTextOf(names: (string | null | undefined)[]): string {
  const parts = new Set<string>();
  for (const n of names) {
    const s = n ? normalizeSearch(n) : "";
    if (s) parts.add(s);
  }
  return [...parts].join(" | ");
}

// Escapes LIKE wildcards in user input.
export const escapeLike = (s: string) => s.replace(/[\\%_]/g, (c) => `\\${c}`);
