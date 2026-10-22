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

// Drives the OAuth buttons: "Connecting…" while the request is in flight; if the
// provider isn't configured server-side (404) a toast shows, then the button reverts.
export function useOAuth(callbackURL: () => string) {
  const [connecting, setConnecting] = useState<OAuthProvider | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  useEffect(() => () => clearTimeout(timer.current), []);

  const connect = async (provider: OAuthProvider) => {
    if (connecting) return;
    setConnecting(provider);
    const { error } = await authClient.signIn.social({ provider, callbackURL: callbackURL() });
    if (!error) return; // browser is navigating to the provider
    setToast(error.status === 404 ? "OAuth not configured yet" : error.message || "Couldn't reach provider");
    timer.current = setTimeout(() => { setToast(null); setConnecting(null); }, TOAST_MS);
  };

  const toastEl = (
    <div className={`auth-toast ${toast ? "visible" : ""}`} role="status" aria-live="polite">
      <span className="auth-toast-dot" />
      {toast}
    </div>
  );

  return { connecting, connect, toast: toastEl };
}
