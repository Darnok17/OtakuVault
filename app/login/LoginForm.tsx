"use client";

import { useState } from "react";
import Link from "next/link";
import { authClient } from "@/lib/auth-client";
import { AuthError, redirectTarget, useOAuth, type OAuthConfigured } from "@/app/_components/auth-ui";

export default function LoginForm({ oauthConfigured }: { oauthConfigured: OAuthConfigured }) {
  const [showPw, setShowPw] = useState(false);
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const oauth = useOAuth(() => redirectTarget(), oauthConfigured);

  const onSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    const email = String(form.get("identifier") ?? "").trim();
    const password = String(form.get("password") ?? "");
    setError(null);
    if (!email.includes("@")) {
      setError("> err: username login isn't supported yet — use your email");
      return;
    }

    setLoading(true);
    const { error } = await authClient.signIn.email({ email, password });
    setLoading(false);
    if (error) {
      setError(`> err: ${error.status === 401 ? "invalid email or password" : (error.message ?? "login failed").toLowerCase()}`);
      return;
    }
    setDone(true);
    // Full navigation, not router.replace: a /collection prefetched while signed out
    // is cached as the proxy's /login redirect and would bounce us straight back.
    window.location.assign(redirectTarget());
  };

  return (
    <section className="site-page active" id="page-login" data-page="login">
      <div className="auth-wrap">
        <div className="auth-main">
          <div className="auth-card">
            <div className="auth-title-bar">
              <div className="auth-title-dots">
                <span className="auth-title-dot"></span>
                <span className="auth-title-dot"></span>
                <span className="auth-title-dot"></span>
              </div>
              <div className="auth-title-path">~<span className="path-slash">/</span>otakuvault<span className="path-slash">/</span>login</div>
            </div>
            <div className="auth-card-body">
              <div className="auth-eyebrow">Welcome Back</div>
              <div className="auth-title">Log <span className="accent">In</span></div>
              <div className="auth-kanji" data-latin="Welcome back">再接続</div>
              <div className="auth-subtitle">Pick up where you left off — your collection, lists, and moodboards are waiting.</div>

              {oauth.buttons}

              <div className="auth-divider">or log in with email</div>

              <form className="auth-form" onSubmit={onSubmit} autoComplete="off">
                <div className="auth-field">
                  <label className="auth-field-label">Email or Username</label>
                  <div className="auth-field-input-wrap">
                    <span className="auth-field-icon">
                      <svg width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" viewBox="0 0 24 24"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>
                    </span>
                    <input type="text" name="identifier" placeholder="you@example.com or your_handle" required />
                  </div>
                </div>

                <div className="auth-field">
                  <label className="auth-field-label">
                    <span>Password</span>
                    <a href="#" className="auth-forgot" tabIndex={-1}>Forgot?</a>
                  </label>
                  <div className="auth-field-input-wrap">
                    <span className="auth-field-icon">
                      <svg width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" viewBox="0 0 24 24"><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>
                    </span>
                    <input type={showPw ? "text" : "password"} name="password" placeholder="••••••••" required />
                    <button type="button" className="auth-field-toggle" onClick={() => setShowPw(!showPw)}>
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8S1 12 1 12Z"/><circle cx="12" cy="12" r="3"/></svg>
                    </button>
                  </div>
                </div>

                <div className="auth-check-row">
                  <label className="auth-check">
                    <input type="checkbox" defaultChecked />
                    <span className="auth-check-box"></span>
                    <span className="auth-check-text">Keep me logged in</span>
                  </label>
                  <a href="#" className="auth-forgot" tabIndex={-1}>Need help?</a>
                </div>

                <button type="submit" className={`auth-submit ${loading ? "loading" : ""}`} disabled={loading}>
                  {done ? "✓ Logged In" : loading ? "Processing" : "Log In"}
                </button>
                <AuthError message={error} />
              </form>

              <div className="auth-footer">
                New here?<Link href="/signup">Create an account</Link>
              </div>
            </div>
          </div>
        </div>

        <aside className="auth-side">
          <div className="auth-side-inner">
            <div className="auth-side-eyebrow">◆ Right where you left it ◆</div>
            <div className="auth-side-title">Everything, <br />in sync</div>
            <div className="auth-side-kanji" data-latin="In sync">同期</div>
            <div className="auth-side-copy">
              Your watchlists, ratings, moodboards, and forum threads load exactly as you left them — on whatever device you log in from next.
            </div>
            <div className="auth-benefits">
              <div className="auth-benefit"><div className="auth-benefit-icon">蔵</div><div className="auth-benefit-text"><div className="auth-benefit-title">Your Collection</div><div className="auth-benefit-desc">Pick up right where you paused — every title, every rating, every tag.</div></div></div>
              <div className="auth-benefit"><div className="auth-benefit-icon">板</div><div className="auth-benefit-text"><div className="auth-benefit-title">Saved Moodboards</div><div className="auth-benefit-desc">All your canvases, wires, and custom nodes — ready to open and edit.</div></div></div>
              <div className="auth-benefit"><div className="auth-benefit-icon">通</div><div className="auth-benefit-text"><div className="auth-benefit-title">Thread Activity</div><div className="auth-benefit-desc">New replies on your subscribed threads, reactions, and mentions.</div></div></div>
              <div className="auth-benefit"><div className="auth-benefit-icon">鍵</div><div className="auth-benefit-text"><div className="auth-benefit-title">Secure by Default</div><div className="auth-benefit-desc">2FA, device sessions, and passkey support keep your vault locked down.</div></div></div>
            </div>
            <div className="auth-side-stats">
              <div className="auth-side-stat"><div className="auth-side-stat-num">142</div><div className="auth-side-stat-label">Online Now</div></div>
              <div className="auth-side-stat"><div className="auth-side-stat-num">99.9%</div><div className="auth-side-stat-label">Uptime</div></div>
              <div className="auth-side-stat"><div className="auth-side-stat-num">24/7</div><div className="auth-side-stat-label">Support</div></div>
            </div>
          </div>
        </aside>
      </div>
      {oauth.toast}
    </section>
  );
}