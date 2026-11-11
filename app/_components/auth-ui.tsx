"use client";

import { useEffect, useRef, useState } from "react";
import { authClient } from "@/lib/auth-client";

export type OAuthProvider = "google" | "discord" | "github";

// Only follow same-origin paths so ?redirect= can't bounce users off-site.
export function redirectTarget(fallback = "/collection") {
  const param = new URLSearchParams(window.location.search).get("redirect");
  return param && param.startsWith("/") && !param.startsWith("//") ? param : fallback;
}

export function AuthError({ message }: { message: string | null }) {
  if (!message) return null;
  return <div className="auth-error" role="alert">{message}</div>;
}

const TOAST_MS = 2200;

export type OAuthConfigured = Record<OAuthProvider, boolean>;

const PROVIDERS: { id: OAuthProvider; name: string; icon: React.ReactNode }[] = [
  { id: "google", name: "Google", icon: <svg viewBox="0 0 24 24" fill="none" width="14" height="14" aria-hidden="true"><path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.27-4.74 3.27-8.1Z" fill="#4285F4"/><path d="M12 23c2.97 0 5.46-.98 7.28-2.65l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84A11 11 0 0 0 12 23Z" fill="#34A853"/><path d="M5.84 14.11a6.6 6.6 0 0 1 0-4.22V7.07H2.18a11 11 0 0 0 0 9.86l3.66-2.82Z" fill="#FBBC05"/><path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.82C6.71 7.3 9.14 5.38 12 5.38Z" fill="#EA4335"/></svg> },
  { id: "discord", name: "Discord", icon: <svg viewBox="0 0 24 24" fill="#5865F2" width="14" height="14" aria-hidden="true"><path d="M20.317 4.37a19.79 19.79 0 0 0-4.885-1.515.07.07 0 0 0-.074.035c-.21.375-.444.864-.608 1.25a18.27 18.27 0 0 0-5.487 0 12.64 12.64 0 0 0-.618-1.25.08.08 0 0 0-.074-.035A19.74 19.74 0 0 0 3.677 4.37a.07.07 0 0 0-.032.027C.533 9.046-.32 13.58.1 18.058a.08.08 0 0 0 .031.055 19.9 19.9 0 0 0 5.993 3.03.08.08 0 0 0 .084-.028c.462-.63.874-1.295 1.226-1.994a.08.08 0 0 0-.041-.106 13.1 13.1 0 0 1-1.873-.892.08.08 0 0 1-.008-.132c.126-.094.252-.192.372-.291a.07.07 0 0 1 .077-.01c3.927 1.793 8.18 1.793 12.062 0a.07.07 0 0 1 .078.01c.12.099.246.197.372.291a.08.08 0 0 1-.006.132 12.3 12.3 0 0 1-1.874.891.08.08 0 0 0-.041.107c.36.698.772 1.362 1.225 1.993a.08.08 0 0 0 .084.028 19.84 19.84 0 0 0 6.002-3.03.08.08 0 0 0 .032-.054c.5-5.177-.838-9.674-3.549-13.66a.06.06 0 0 0-.031-.028ZM8.02 15.33c-1.183 0-2.157-1.085-2.157-2.42 0-1.333.956-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.334-.956 2.42-2.157 2.42Zm7.975 0c-1.183 0-2.157-1.085-2.157-2.42 0-1.333.955-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.334-.946 2.42-2.157 2.42Z"/></svg> },
  { id: "github", name: "GitHub", icon: <svg viewBox="0 0 24 24" fill="currentColor" width="14" height="14" aria-hidden="true"><path d="M12 .3a12 12 0 0 0-3.8 23.38c.6.12.83-.26.83-.57v-2c-3.34.72-4.03-1.6-4.03-1.6-.55-1.4-1.33-1.76-1.33-1.76-1.09-.74.08-.73.08-.73 1.2.09 1.84 1.24 1.84 1.24 1.07 1.83 2.82 1.3 3.5.99.11-.78.42-1.3.76-1.6-2.67-.3-5.47-1.33-5.47-5.93 0-1.3.47-2.38 1.24-3.22-.14-.3-.54-1.52.1-3.18 0 0 1.02-.33 3.3 1.23a11.4 11.4 0 0 1 6 0c2.3-1.56 3.3-1.23 3.3-1.23.65 1.66.25 2.87.12 3.18a4.65 4.65 0 0 1 1.24 3.22c0 4.6-2.8 5.63-5.48 5.92.42.37.81 1.1.81 2.22v3.3c0 .32.21.7.82.58A12 12 0 0 0 12 .3"/></svg> },
];

// Drives the OAuth buttons. A provider whose env vars are missing renders greyed out and marked
// "Not configured"; it stays clickable (aria-disabled, not disabled) so the click can explain
// why in a toast. Configured ones show "Connecting…" while the redirect is being prepared.
export function useOAuth(callbackURL: () => string, configured: OAuthConfigured) {
  const [connecting, setConnecting] = useState<OAuthProvider | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  useEffect(() => () => clearTimeout(timer.current), []);

  const flash = (message: string) => {
    clearTimeout(timer.current);
    setToast(message);
    timer.current = setTimeout(() => { setToast(null); setConnecting(null); }, TOAST_MS);
  };

  const connect = async (provider: OAuthProvider, name: string) => {
    if (connecting) return;
    if (!configured[provider]) return flash(`${name} sign-in isn't configured yet`);
    setConnecting(provider);
    const { error } = await authClient.signIn.social({ provider, callbackURL: callbackURL() });
    if (!error) return; // browser is navigating to the provider
    flash(error.status === 404 ? `${name} sign-in isn't configured yet` : error.message || `Couldn't reach ${name}`);
  };

  const buttons = (
    <div className="auth-oauth">
      {PROVIDERS.map(({ id, name, icon }) => {
        const off = !configured[id];
        return (
          <button
            key={id} type="button" className={`auth-oauth-btn${off ? " not-configured" : ""}`} data-provider={id}
            data-connecting={connecting === id || undefined} aria-disabled={off || undefined} disabled={!!connecting && !off}
            title={off ? `${name} sign-in isn't configured yet` : undefined}
            onClick={() => connect(id, name)}
          >
            {icon}
            <span className="auth-oauth-name">{connecting === id ? "Connecting…" : name}</span>
            {off && <span className="auth-oauth-off">Not configured</span>}
          </button>
        );
      })}
    </div>
  );

  const toastEl = (
    <div className={`auth-toast ${toast ? "visible" : ""}`} role="status" aria-live="polite">
      <span className="auth-toast-dot" />
      {toast}
    </div>
  );

  return { buttons, toast: toastEl };
}
