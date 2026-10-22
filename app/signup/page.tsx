"use client";

import { useState } from "react";
import Link from "next/link";
import { authClient } from "@/lib/auth-client";
import { AuthError, useOAuth } from "@/app/_components/auth-ui";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export default function SignupPage() {
  const [showPw, setShowPw] = useState(false);
  const [showConf, setShowConf] = useState(false);
  const [pw, setPw] = useState("");
  const [conf, setConf] = useState("");
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const strength = (() => {
    let s = 0;
    if (pw.length >= 8) s++;
    if (pw.length >= 12) s++;
    if (/[A-Z]/.test(pw) && /[a-z]/.test(pw)) s++;
    if (/\d/.test(pw) && /[^A-Za-z0-9]/.test(pw)) s++;
    if (pw.length === 0) s = 0;
    return Math.min(4, s);
  })();
  const strengthLabel = ["—", "Weak", "Fair", "Good", "Strong"][strength];
  const matchColor = conf ? (conf === pw ? "rgba(0,212,170,.5)" : "rgba(233,69,96,.5)") : "";

  const oauth = useOAuth(() => "/collection");

  const validate = (username: string, email: string) => {
    if (!username) return "username is required";
    if (!EMAIL_RE.test(email)) return "enter a valid email address";
    if (pw.length < 8) return "password must be 8+ characters";
    if (conf !== pw) return "passwords don't match";
    return null;
  };

  const onSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    const username = String(form.get("username") ?? "").trim();
    const email = String(form.get("email") ?? "").trim();
    const invalid = validate(username, email);
    setError(invalid && `> err: ${invalid}`);
    if (invalid) return;

    setLoading(true);
    const { error } = await authClient.signUp.email({ email, password: pw, name: username });
    setLoading(false);
    if (error) {
      setError(`> err: ${(error.message ?? "sign-up failed").toLowerCase()}`);
      return;
    }
    setDone(true);
    // Full navigation, not router.replace: a /collection prefetched while signed out
    // is cached as the proxy's /login redirect and would bounce us straight back.
    // eslint-disable-next-line @next/next/no-location-assign-relative-destination -- see above
    window.location.assign("/collection");
  };

  return (
    <section className="site-page active" id="page-signup" data-page="signup">
      <div className="auth-wrap">
        <div className="auth-main">
          <div className="auth-card">
            <div className="auth-title-bar">
              <div className="auth-title-dots">
                <span className="auth-title-dot"></span>
                <span className="auth-title-dot"></span>
                <span className="auth-title-dot"></span>
              </div>
              <div className="auth-title-path">~<span className="path-slash">/</span>otakuvault<span className="path-slash">/</span>register</div>
            </div>
            <div className="auth-card-body">
              <div className="auth-eyebrow">New User</div>
              <div className="auth-title">Join <span className="accent">OtakuVault</span></div>
              <div className="auth-kanji">新規登録</div>
              <div className="auth-subtitle">Track thousands of titles, build moodboards, and connect with 12,000+ collectors.</div>

              <div className="auth-oauth">
                <button className="auth-oauth-btn" type="button" data-connecting={oauth.connecting === "google" || undefined} disabled={!!oauth.connecting} onClick={() => oauth.connect("google")}>{oauth.connecting === "google" ? "Connecting…" : "Google"}</button>
                <button className="auth-oauth-btn" type="button" data-connecting={oauth.connecting === "discord" || undefined} disabled={!!oauth.connecting} onClick={() => oauth.connect("discord")}>{oauth.connecting === "discord" ? "Connecting…" : "Discord"}</button>
                <button className="auth-oauth-btn" type="button" data-connecting={oauth.connecting === "github" || undefined} disabled={!!oauth.connecting} onClick={() => oauth.connect("github")}>{oauth.connecting === "github" ? "Connecting…" : "GitHub"}</button>
              </div>

              <div className="auth-divider">or register with email</div>

              <form className="auth-form" onSubmit={onSubmit} autoComplete="off">
                <div className="auth-field-row">
                  <div className="auth-field">
                    <label className="auth-field-label"><span>Username</span><span className="auth-field-hint">unique</span></label>
                    <div className="auth-field-input-wrap">
                      <input type="text" name="username" placeholder="your_handle" required style={{paddingLeft: "0.9rem"}} />
                    </div>
                  </div>
                  <div className="auth-field">
                    <label className="auth-field-label"><span>Display Name</span><span className="auth-field-hint">optional</span></label>
                    <div className="auth-field-input-wrap">
                      <input type="text" name="display" placeholder="How it shows up" style={{paddingLeft: "0.9rem"}} />
                    </div>
                  </div>
                </div>

                <div className="auth-field">
                  <label className="auth-field-label">Email Address</label>
                  <div className="auth-field-input-wrap">
                    <input type="email" name="email" placeholder="you@example.com" required style={{paddingLeft: "0.9rem"}} />
                  </div>
                </div>

                <div className="auth-field">
                  <label className="auth-field-label"><span>Password</span><span className="auth-field-hint">8+ chars</span></label>
                  <div className="auth-field-input-wrap">
                    <input type={showPw ? "text" : "password"} value={pw} onChange={(e) => setPw(e.target.value)} placeholder="••••••••" required minLength={8} style={{paddingLeft: "0.9rem"}} />
                    <button type="button" className="auth-field-toggle" onClick={() => setShowPw(!showPw)}>
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8S1 12 1 12Z"/><circle cx="12" cy="12" r="3"/></svg>
                    </button>
                  </div>
                  <div className="auth-strength" data-level={strength}>
                    <span className="auth-strength-bar"></span>
                    <span className="auth-strength-bar"></span>
                    <span className="auth-strength-bar"></span>
                    <span className="auth-strength-bar"></span>
                  </div>
                  <div className="auth-strength-label"><span>Strength</span><strong>{strengthLabel}</strong></div>
                </div>

                <div className="auth-field">
                  <label className="auth-field-label">Confirm Password</label>
                  <div className="auth-field-input-wrap">
                    <input type={showConf ? "text" : "password"} value={conf} onChange={(e) => setConf(e.target.value)} placeholder="••••••••" required minLength={8} style={{paddingLeft: "0.9rem", borderColor: matchColor}} />
                    <button type="button" className="auth-field-toggle" onClick={() => setShowConf(!showConf)}>
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8S1 12 1 12Z"/><circle cx="12" cy="12" r="3"/></svg>
                    </button>
                  </div>
                </div>

                <div className="auth-check-row">
                  <label className="auth-check">
                    <input type="checkbox" required />
                    <span className="auth-check-box"></span>
                    <span className="auth-check-text">I agree to the <a href="#" tabIndex={-1}>Terms</a> &amp; <a href="#" tabIndex={-1}>Privacy</a></span>
                  </label>
                </div>
                <div className="auth-check-row">
                  <label className="auth-check">
                    <input type="checkbox" />
                    <span className="auth-check-box"></span>
                    <span className="auth-check-text">Send me new-release alerts &amp; recommendations</span>
                  </label>
                </div>

                <button type="submit" className={`auth-submit ${loading ? "loading" : ""}`} disabled={loading}>
                  {done ? "✓ Account Created" : loading ? "Processing" : "Create Account"}
                </button>
                <AuthError message={error} />
              </form>

              <div className="auth-footer">
                Already have an account?<Link href="/login">Log in</Link>
              </div>
            </div>
          </div>
        </div>

        <aside className="auth-side">
          <div className="auth-side-inner">
            <div className="auth-side-eyebrow">◆ Why Join ◆</div>
            <div className="auth-side-title">Your vault, <br />everywhere</div>
            <div className="auth-side-kanji">収蔵庫</div>
            <div className="auth-side-copy">
              OtakuVault keeps your entire anime, manga, webtoon, and novel collection in sync across every device — and plugs into the sites you already use.
            </div>
            <div className="auth-benefits">
              <div className="auth-benefit"><div className="auth-benefit-icon">追</div><div className="auth-benefit-text"><div className="auth-benefit-title">Cross-Device Tracking</div><div className="auth-benefit-desc">Your progress follows you across phone, laptop, and browser extension.</div></div></div>
              <div className="auth-benefit"><div className="auth-benefit-icon">板</div><div className="auth-benefit-text"><div className="auth-benefit-title">Visual Moodboards</div><div className="auth-benefit-desc">Build infinite canvases of favorites, with wires linking related works.</div></div></div>
              <div className="auth-benefit"><div className="auth-benefit-icon">薦</div><div className="auth-benefit-text"><div className="auth-benefit-title">Personalized Recs</div><div className="auth-benefit-desc">Discover what to watch next based on what you&apos;ve already loved.</div></div></div>
              <div className="auth-benefit"><div className="auth-benefit-icon">話</div><div className="auth-benefit-text"><div className="auth-benefit-title">Community Forum</div><div className="auth-benefit-desc">Join 12,000+ members in discussions, reviews, and weekly watch-alongs.</div></div></div>
            </div>
            <div className="auth-side-stats">
              <div className="auth-side-stat"><div className="auth-side-stat-num">12k+</div><div className="auth-side-stat-label">Members</div></div>
              <div className="auth-side-stat"><div className="auth-side-stat-num">14k</div><div className="auth-side-stat-label">Titles</div></div>
              <div className="auth-side-stat"><div className="auth-side-stat-num">86k</div><div className="auth-side-stat-label">Posts</div></div>
            </div>
          </div>
        </aside>
      </div>
      {oauth.toast}
    </section>
  );
}