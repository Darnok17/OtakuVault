// The selectable themes. Shared by the server (root layout, auth) and the client (ThemeProvider,
// Settings, the home page) — keep it free of imports. Each id has a token block in
// app/_themes/<id>.css.

export const THEMES = [
  { id: "terminal", name: "Terminal", blurb: "Neon on midnight. The original.", mode: "dark" },
  { id: "rustic", name: "Rustic", blurb: "Ink on parchment, bound like a tavern codex.", mode: "light" },
  { id: "retro", name: "Retro", blurb: "VHS chrome, hot pink and a CRT hum.", mode: "dark" },
  { id: "minimal", name: "Minimal", blurb: "Black, white, one red line.", mode: "light" },
  { id: "comic-strip", name: "Comic Strip", blurb: "Speed lines, screentone, maximum volume.", mode: "light" },
  { id: "manga", name: "Manga Panel", blurb: "Ink, halftone and gutters. Read it like a page.", mode: "light" },
] as const;

export type ThemeId = (typeof THEMES)[number]["id"];

export const DEFAULT_THEME: ThemeId = "terminal";
export const THEME_IDS: readonly ThemeId[] = THEMES.map((t) => t.id);
export const isThemeId = (v: unknown): v is ThemeId => typeof v === "string" && (THEME_IDS as readonly string[]).includes(v);
export const themeName = (id: ThemeId) => THEMES.find((t) => t.id === id)!.name;

// Ids a theme used to have. Cookies, localStorage and account rows written before a rename still
// hold the old id; it is read as the new one instead of falling back to the default theme.
const LEGACY_THEME_IDS: Record<string, ThemeId> = { anime: "comic-strip" };
export const toThemeId = (v: unknown): ThemeId | null =>
  isThemeId(v) ? v : typeof v === "string" && Object.hasOwn(LEGACY_THEME_IDS, v) ? LEGACY_THEME_IDS[v] : null;

// Where the choice is kept: a cookie (read before first paint), localStorage (the zustand store)
// and users.preferred_theme (signed-in users, so it follows them across devices).
export const THEME_COOKIE = "ov_theme";
export const THEME_STORAGE_KEY = "ov-theme";

// Runs in <head> before the first paint, so a saved theme never flashes the default one. The
// cookie is read here rather than with cookies() on the server: that would make every page
// dynamic. Falls back to the store's localStorage copy if the cookie was cleared, and restores
// the "effects off" switch (kept in the same store). Renamed ids are mapped to their new name.
export const THEME_INIT_SCRIPT = `(function(){try{var d=document.documentElement,ok=/^(${THEME_IDS.join("|")})$/,L=${JSON.stringify(LEGACY_THEME_IDS)},m=document.cookie.match(/(?:^|; )${THEME_COOKIE}=([^;]*)/),t=m&&decodeURIComponent(m[1]),s=JSON.parse(localStorage.getItem("${THEME_STORAGE_KEY}")||"null"),st=s&&s.state;if((!t||!(ok.test(t)||L[t]))&&st)t=st.theme;if(t&&L[t])t=L[t];if(t&&ok.test(t))d.setAttribute("data-theme",t);if(st&&st.fx===false)d.setAttribute("data-fx","off")}catch(e){}})()`;
