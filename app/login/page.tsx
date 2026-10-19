"use client";

import { useState } from "react";
import Link from "next/link";

export default function LoginPage() {
  const [showPw, setShowPw] = useState(false);
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);

  const onSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setTimeout(() => { setLoading(false); setDone(true); setTimeout(() => setDone(false), 1500); }, 900);
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
              <div className="auth-kanji">再接続</div>
              <div className="auth-subtitle">Pick up where you left off — your collection, lists, and moodboards are waiting.</div>

              <div className="auth-oauth">
                <button className="auth-oauth-btn" data-provider="google" type="button">
                  <svg viewBox="0 0 24 24" fill="none" width="14" height="14"><path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.27-4.74 3.27-8.1Z" fill="#4285F4"/><path d="M12 23c2.97 0 5.46-.98 7.28-2.65l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84A11 11 0 0 0 12 23Z" fill="#34A853"/><path d="M5.84 14.11a6.6 6.6 0 0 1 0-4.22V7.07H2.18a11 11 0 0 0 0 9.86l3.66-2.82Z" fill="#FBBC05"/><path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.82C6.71 7.3 9.14 5.38 12 5.38Z" fill="#EA4335"/></svg>
                  Google
                </button>
                <button className="auth-oauth-btn" data-provider="discord" type="button">
                  <svg viewBox="0 0 24 24" fill="#5865F2" width="14" height="14"><path d="M20.317 4.37a19.79 19.79 0 0 0-4.885-1.515.07.07 0 0 0-.074.035c-.21.375-.444.864-.608 1.25a18.27 18.27 0 0 0-5.487 0 12.64 12.64 0 0 0-.618-1.25.08.08 0 0 0-.074-.035A19.74 19.74 0 0 0 3.677 4.37a.07.07 0 0 0-.032.027C.533 9.046-.32 13.58.1 18.058a.08.08 0 0 0 .031.055 19.9 19.9 0 0 0 5.993 3.03.08.08 0 0 0 .084-.028c.462-.63.874-1.295 1.226-1.994a.08.08 0 0 0-.041-.106 13.1 13.1 0 0 1-1.873-.892.08.08 0 0 1-.008-.132c.126-.094.252-.192.372-.291a.07.07 0 0 1 .077-.01c3.927 1.793 8.18 1.793 12.062 0a.07.07 0 0 1 .078.01c.12.099.246.197.372.291a.08.08 0 0 1-.006.132 12.3 12.3 0 0 1-1.874.891.08.08 0 0 0-.041.107c.36.698.772 1.362 1.225 1.993a.08.08 0 0 0 .084.028 19.84 19.84 0 0 0 6.002-3.03.08.08 0 0 0 .032-.054c.5-5.177-.838-9.674-3.549-13.66a.06.06 0 0 0-.031-.028ZM8.02 15.33c-1.183 0-2.157-1.085-2.157-2.42 0-1.333.956-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.334-.956 2.42-2.157 2.42Zm7.975 0c-1.183 0-2.157-1.085-2.157-2.42 0-1.333.955-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.334-.946 2.42-2.157 2.42Z"/></svg>
                  Discord
                </button>
                <button className="auth-oauth-btn" data-provider="github" type="button">
                  <svg viewBox="0 0 24 24" fill="currentColor" width="14" height="14"><path d="M12 .3a12 12 0 0 0-3.8 23.38c.6.12.83-.26.83-.57v-2c-3.34.72-4.03-1.6-4.03-1.6-.55-1.4-1.33-1.76-1.33-1.76-1.09-.74.08-.73.08-.73 1.2.09 1.84 1.24 1.84 1.24 1.07 1.83 2.82 1.3 3.5.99.11-.78.42-1.3.76-1.6-2.67-.3-5.47-1.33-5.47-5.93 0-1.3.47-2.38 1.24-3.22-.14-.3-.54-1.52.1-3.18 0 0 1.02-.33 3.3 1.23a11.4 11.4 0 0 1 6 0c2.3-1.56 3.3-1.23 3.3-1.23.65 1.66.25 2.87.12 3.18a4.65 4.65 0 0 1 1.24 3.22c0 4.6-2.8 5.63-5.48 5.92.42.37.81 1.1.81 2.22v3.3c0 .32.21.7.82.58A12 12 0 0 0 12 .3"/></svg>
                  GitHub
                </button>
              </div>

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
            <div className="auth-side-kanji">同期</div>
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
    </section>
  );
}