"use client";

import { useState, useSyncExternalStore, useTransition } from "react";
import Link from "next/link";
import { authClient } from "@/lib/auth-client";
import { setProfilePublic } from "@/app/actions/settings";
import { ThemeGrid } from "@/app/_components/ThemePicker";
import { useThemeStore } from "@/app/_components/ThemeProvider";

type Account = { name: string; email: string; username: string; isProfilePublic: boolean; joined: string };

const TABS = [
  ["profile", "Profile"], ["appearance", "Appearance"], ["account", "Account"],
  ["notifications", "Notifications"], ["privacy", "Privacy"],
] as const;
type TabId = (typeof TABS)[number][0];
const isTab = (v: string): v is TabId => TABS.some(([id]) => id === v);

// The open section lives in the URL hash, so a link can point straight at one.
const subscribeHash = (cb: () => void) => {
  window.addEventListener("hashchange", cb);
  return () => window.removeEventListener("hashchange", cb);
};
const readHash = () => window.location.hash.slice(1);

function ChangePassword() {
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setDone(false);
    if (next.length < 8) return setError("New password needs at least 8 characters.");
    if (next !== confirm) return setError("The two new passwords don't match.");
    setError(null); setBusy(true);
    const { error: err } = await authClient.changePassword({ currentPassword: current, newPassword: next, revokeOtherSessions: true });
    setBusy(false);
    if (err) return setError(err.message || "Couldn't change the password. Check your current password and try again.");
    setCurrent(""); setNext(""); setConfirm(""); setDone(true);
  };

  return (
    <form onSubmit={submit} style={{ maxWidth: 420 }}>
      <div className="ov-field">
        <label className="ov-label" htmlFor="pw-current">Current password</label>
        <input id="pw-current" className="ov-input" type="password" autoComplete="current-password" required value={current} onChange={(e) => setCurrent(e.target.value)} />
      </div>
      <div className="ov-field">
        <label className="ov-label" htmlFor="pw-new">New password</label>
        <input id="pw-new" className="ov-input" type="password" autoComplete="new-password" required minLength={8} value={next} onChange={(e) => setNext(e.target.value)} />
        <span className="ov-hint">At least 8 characters. Other devices are signed out when it changes.</span>
      </div>
      <div className="ov-field">
        <label className="ov-label" htmlFor="pw-confirm">New password again</label>
        <input id="pw-confirm" className="ov-input" type="password" autoComplete="new-password" required value={confirm} onChange={(e) => setConfirm(e.target.value)} />
      </div>
      {error && <div className="ov-error" role="alert" style={{ marginBottom: "1rem" }}>{error}</div>}
      {done && <div className="ov-ok" role="status" style={{ marginBottom: "1rem" }}>Password changed.</div>}
      <button className="btn btn-primary" type="submit" disabled={busy}>{busy ? "Changing…" : "Change password"}</button>
    </form>
  );
}

export default function SettingsClient({ account }: { account: Account }) {
  const hash = useSyncExternalStore(subscribeHash, readHash, () => "");
  const tab: TabId = isTab(hash) ? hash : "profile";
  const pickTab = (id: TabId) => {
    history.replaceState(null, "", `#${id}`);
    window.dispatchEvent(new HashChangeEvent("hashchange"));
  };

  const fx = useThemeStore((s) => s.fx);
  const setFx = useThemeStore((s) => s.setFx);

  const [isPublic, setIsPublic] = useState(account.isProfilePublic);
  const [privacyError, setPrivacyError] = useState<string | null>(null);
  const [savingPrivacy, startPrivacy] = useTransition();
  const togglePublic = (v: boolean) => {
    setIsPublic(v); setPrivacyError(null);
    startPrivacy(async () => {
      try { await setProfilePublic(v); }
      catch { setIsPublic(!v); setPrivacyError("Couldn't save that. Try again."); }
    });
  };

  const signOut = async () => {
    await authClient.signOut();
    // eslint-disable-next-line @next/next/no-location-assign-relative-destination -- hard navigation drops pages cached for the signed-in user
    window.location.assign("/");
  };

  return (
    <div className="set-layout">
      <div className="set-nav" role="tablist" aria-label="Settings sections" aria-orientation="vertical">
        {TABS.map(([id, label]) => (
          <button key={id} type="button" role="tab" id={`set-tab-${id}`} aria-selected={tab === id} aria-controls={`set-panel-${id}`} className="set-nav-item" onClick={() => pickTab(id)}>
            {label}
          </button>
        ))}
      </div>

      <div role="tabpanel" id={`set-panel-${tab}`} aria-labelledby={`set-tab-${tab}`}>
        {tab === "profile" && (
          <section className="ov-panel">
            <h2 className="ov-title">Profile</h2>
            <p className="ov-sub" style={{ marginBottom: "1.2rem" }}>What other people see next to your posts and on your profile page.</p>
            <dl className="set-facts">
              <dt>Display name</dt><dd>{account.name}</dd>
              <dt>Username</dt><dd>@{account.username}</dd>
              <dt>Email</dt><dd>{account.email}</dd>
              <dt>Joined</dt><dd>{new Date(account.joined).toLocaleDateString(undefined, { year: "numeric", month: "long", day: "numeric", timeZone: "UTC" })}</dd>
            </dl>
            <div className="ov-row">
              <Link className="btn btn-primary" href="/profile/edit">Edit profile</Link>
              <Link className="btn btn-ghost" href={`/profile/${account.username}`}>View profile</Link>
            </div>
          </section>
        )}

        {tab === "appearance" && (
          <>
            <section className="ov-panel">
              <h2 className="ov-title">Themes</h2>
              <p className="ov-sub" style={{ marginBottom: "1.2rem" }}>Changes the whole site. Saved to your account, so it follows you to your other devices.</p>
              <ThemeGrid />
            </section>
            <section className="ov-panel">
              <h2 className="ov-title">Effects</h2>
              <label className="ov-toggle" style={{ marginTop: ".8rem" }}>
                <input type="checkbox" checked={fx} onChange={(e) => setFx(e.target.checked)} />
                <span className="ov-toggle-track" />
                <span className="ov-toggle-text">
                  <span className="ov-toggle-title">Screen effects</span>
                  <span className="ov-toggle-desc">The CRT scanline overlay in Retro and the cursor sparkle trail in Super Anime. Kept on this device.</span>
                </span>
              </label>
            </section>
          </>
        )}

        {tab === "account" && (
          <>
            <section className="ov-panel">
              <h2 className="ov-title">Change password</h2>
              <p className="ov-sub" style={{ marginBottom: "1.2rem" }}>For accounts that sign in with email. If you only use Google, Discord or GitHub, there is no password to change.</p>
              <ChangePassword />
            </section>
            <section className="ov-panel">
              <h2 className="ov-title">Sign out</h2>
              <p className="ov-sub" style={{ marginBottom: "1rem" }}>Signs you out on this device.</p>
              <button className="btn btn-ghost" type="button" onClick={signOut}>Sign out</button>
            </section>
            <section className="ov-panel">
              <div className="ov-row"><h2 className="ov-title">Delete account</h2><span className="ov-soon">Coming soon</span></div>
              <p className="ov-sub" style={{ marginBottom: "1rem" }}>Removes your account, collection, moodboards and posts for good. Not available yet.</p>
              <button className="btn btn-ghost" type="button" disabled>Delete account</button>
            </section>
          </>
        )}

        {tab === "notifications" && (
          <section className="ov-panel">
            <div className="ov-row"><h2 className="ov-title">Notifications</h2><span className="ov-soon">Coming soon</span></div>
            <p className="ov-sub">Choose what you hear about: replies to your threads, new episodes of what you&apos;re watching, and store restocks. Nothing is sent today.</p>
          </section>
        )}

        {tab === "privacy" && (
          <section className="ov-panel">
            <h2 className="ov-title">Privacy</h2>
            <label className="ov-toggle" style={{ marginTop: ".9rem" }}>
              <input type="checkbox" checked={isPublic} disabled={savingPrivacy} onChange={(e) => togglePublic(e.target.checked)} />
              <span className="ov-toggle-track" />
              <span className="ov-toggle-text">
                <span className="ov-toggle-title">Public profile</span>
                <span className="ov-toggle-desc">
                  {isPublic
                    ? "Anyone can open your profile page. Turn this off and visitors see only that the profile is private."
                    : "Your profile is private. Only you can see it; your forum posts still show your name."}
                </span>
              </span>
            </label>
            {privacyError && <div className="ov-error" role="alert" style={{ marginTop: ".8rem" }}>{privacyError}</div>}
            <hr className="set-divider" />
            <p className="ov-sub">Choose which sections of a public profile are visible (bio, pronouns, collection, moodboards, forum posts) on the <Link className="ov-link" href="/profile/edit">profile edit page</Link>.</p>
          </section>
        )}
      </div>
    </div>
  );
}
