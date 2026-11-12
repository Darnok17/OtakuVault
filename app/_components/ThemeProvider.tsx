"use client";

import { useEffect, useLayoutEffect } from "react";
import { create } from "zustand";
import { persist } from "zustand/middleware";
import { authClient } from "@/lib/auth-client";
import { saveThemePreference } from "@/app/actions/settings";
import { DEFAULT_THEME, THEME_COOKIE, THEME_STORAGE_KEY, isThemeId, toThemeId, type ThemeId } from "@/lib/themes";

/* The theme lives in three places:
     • <html data-theme> + a cookie — set before first paint by the inline script in the root
       layout (lib/themes.ts), so there is never a flash of the default theme;
     • this store, persisted to localStorage — what the UI reads and writes;
     • users.preferred_theme — for signed-in users, so the choice follows them across devices.
   ThemeProvider keeps the three in step. */

type Synced = { userId: string; theme: ThemeId };

type ThemeState = {
  theme: ThemeId;
  // Decorative extras a theme may add (Retro's CRT overlay, Comic Strip's cursor sparkles).
  fx: boolean;
  // The account value this browser last saw or wrote; tells "changed here" from "changed elsewhere".
  synced: Synced | null;
  // Not persisted: who is signed in, and whether the store has loaded from localStorage yet.
  userId: string | null;
  ready: boolean;
  setTheme: (theme: ThemeId) => void;
  setFx: (fx: boolean) => void;
};

// Saves run one after another, so the last choice is also the last write.
let saveChain: Promise<unknown> = Promise.resolve();
let pendingSaves = 0;

function pushToAccount(userId: string, theme: ThemeId) {
  pendingSaves++;
  saveChain = saveChain
    .then(() => saveThemePreference(theme))
    .then(() => useThemeStore.setState({ synced: { userId, theme } }))
    .catch((err) => console.error("Saving the theme to your account failed:", err))
    .finally(() => { pendingSaves--; });
  return saveChain;
}

export const useThemeStore = create<ThemeState>()(
  persist(
    (set, get) => ({
      theme: DEFAULT_THEME,
      fx: true,
      synced: null,
      userId: null,
      ready: false,
      setTheme: (theme) => {
        if (!isThemeId(theme)) return;
        set({ theme });
        const { userId } = get();
        if (userId) void pushToAccount(userId, theme);
      },
      setFx: (fx) => set({ fx }),
    }),
    {
      name: THEME_STORAGE_KEY,
      partialize: ({ theme, fx, synced }) => ({ theme, fx, synced }),
      // A saved theme may carry an id from before a rename (see toThemeId).
      merge: (saved, current) => {
        const s = (saved ?? {}) as Partial<Pick<ThemeState, "theme" | "fx" | "synced">>;
        const syncedTheme = toThemeId(s.synced?.theme);
        return {
          ...current, ...s,
          theme: toThemeId(s.theme) ?? current.theme,
          synced: s.synced && syncedTheme ? { ...s.synced, theme: syncedTheme } : null,
        };
      },
      // Loaded in ThemeProvider's layout effect instead of at import, so the first client render
      // matches the server's (which only knows the default theme).
      skipHydration: true,
    },
  ),
);

// Writes the theme where the stylesheet and the next page load will find it.
function applyToDocument(theme: ThemeId, fx: boolean) {
  const root = document.documentElement;
  if (root.getAttribute("data-theme") !== theme) root.setAttribute("data-theme", theme);
  if (fx) root.removeAttribute("data-fx");
  else root.setAttribute("data-fx", "off");
  document.cookie = `${THEME_COOKIE}=${encodeURIComponent(theme)}; path=/; max-age=31536000; SameSite=Lax`;
}

// For a brand-new account: its row still holds the default theme, so the look the visitor
// already picked wins and is saved. Called by the signup page before it navigates away.
export function claimThemeForNewAccount(userId: string) {
  const { theme } = useThemeStore.getState();
  useThemeStore.setState({ userId });
  return pushToAccount(userId, theme);
}

export default function ThemeProvider({ children }: { children: React.ReactNode }) {
  const { data: session } = authClient.useSession();
  const userId = session?.user.id ?? null;
  const accountTheme = session?.user.preferredTheme;

  // Before paint: load the saved choice and (re)assert it on <html>. React's dev double-mount
  // can drop attributes the inline script set, and a cleared cookie needs rewriting.
  useLayoutEffect(() => {
    const hadSaved = (() => {
      try { return localStorage.getItem(THEME_STORAGE_KEY) !== null; } catch { return false; }
    })();
    void useThemeStore.persist.rehydrate();
    if (!hadSaved) {
      // Nothing in localStorage: trust what the inline script took from the cookie.
      const fromDom = toThemeId(document.documentElement.getAttribute("data-theme"));
      if (fromDom) useThemeStore.setState({ theme: fromDom });
    }
    useThemeStore.setState({ ready: true });
    const { theme, fx } = useThemeStore.getState();
    applyToDocument(theme, fx);
    const unsubscribe = useThemeStore.subscribe((s, prev) => {
      if (s.theme !== prev.theme || s.fx !== prev.fx) applyToDocument(s.theme, s.fx);
    });
    // Another tab changed the theme: follow it.
    const onStorage = (e: StorageEvent) => {
      if (e.key === THEME_STORAGE_KEY) void useThemeStore.persist.rehydrate();
    };
    window.addEventListener("storage", onStorage);
    return () => {
      unsubscribe();
      window.removeEventListener("storage", onStorage);
    };
  }, []);

  // Reconcile with the account once the session is known (and whenever it is refetched).
  useEffect(() => {
    useThemeStore.setState({ userId });
    if (!userId || pendingSaves > 0) return;
    const remote = toThemeId(accountTheme) ?? DEFAULT_THEME;
    const { theme, synced } = useThemeStore.getState();
    if (synced?.userId !== userId || synced.theme !== remote) {
      // First time this browser sees the account, or the theme was changed on another device:
      // the account wins.
      useThemeStore.setState({ theme: remote, synced: { userId, theme: remote } });
    } else if (theme !== remote) {
      // Changed here while signed out (or a save failed): the account catches up.
      void pushToAccount(userId, theme);
    }
  }, [userId, accountTheme]);

  return children;
}
