"use client";

import { THEMES } from "@/lib/themes";
import ThemePreview from "./ThemePreview";
import { useThemeStore } from "./ThemeProvider";

// Settings → Appearance: one card per theme, exactly one applied.
export function ThemeGrid() {
  const theme = useThemeStore((s) => s.theme);
  const setTheme = useThemeStore((s) => s.setTheme);
  return (
    <div className="theme-grid" role="radiogroup" aria-label="Theme">
      {THEMES.map((t) => {
        const current = t.id === theme;
        return (
          <div key={t.id} className={`theme-card${current ? " current" : ""}`}>
            <ThemePreview theme={t.id} />
            <div className="theme-card-foot">
              <div>
                <div className="theme-card-name">{t.name}</div>
                <div className="theme-card-blurb">{t.blurb}</div>
              </div>
              <button
                type="button" role="radio" aria-checked={current} aria-label={`Apply ${t.name}`}
                className={`btn btn-sm ${current ? "btn-ghost" : "btn-primary"}`}
                onClick={() => setTheme(t.id)}
              >
                {current ? "Applied" : "Apply"}
              </button>
            </div>
          </div>
        );
      })}
    </div>
  );
}

// Home page: the same previews as a row; clicking one applies it on the spot.
export function ThemeChips() {
  const theme = useThemeStore((s) => s.theme);
  const setTheme = useThemeStore((s) => s.setTheme);
  return (
    <div className="theme-chips">
      {THEMES.map((t) => (
        <button key={t.id} type="button" className="theme-chip" aria-pressed={t.id === theme} onClick={() => setTheme(t.id)}>
          <ThemePreview theme={t.id} />
          <span className="theme-chip-name">{t.name}{t.id === theme && <span className="ov-soon">Applied</span>}</span>
        </button>
      ))}
    </div>
  );
}
