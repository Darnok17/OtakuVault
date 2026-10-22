"use client";

import { Suspense, useEffect, useRef, useState, type ReactNode } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { authClient } from "@/lib/auth-client";

function ActiveLink({ href, children }: { href: string; children: ReactNode }) {
  const path = usePathname();
  return <Link href={href} className={`nav-link ${path === href ? "active" : ""}`}>{children}</Link>;
}

// usePathname suspends while prerendering routes with dynamic params (e.g. a moodboard),
// so each link reads it inside its own boundary and falls back to the inactive link.
function NavLink({ href, children }: { href: string; children: ReactNode }) {
  return (
    <Suspense fallback={<Link href={href} className="nav-link">{children}</Link>}>
      <ActiveLink href={href}>{children}</ActiveLink>
    </Suspense>
  );
}

function UserMenu({ name, email, image }: { name: string; email: string; image?: string | null }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => { if (!ref.current?.contains(e.target as Node)) setOpen(false); };
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    document.addEventListener("pointerdown", onDown);
    document.addEventListener("keydown", onKey);
    return () => { document.removeEventListener("pointerdown", onDown); document.removeEventListener("keydown", onKey); };
  }, [open]);

  const signOut = async () => {
    setOpen(false);
    await authClient.signOut();
    // Hard navigation drops router-cached pages rendered for the signed-in user.
    // eslint-disable-next-line @next/next/no-location-assign-relative-destination -- see above
    window.location.assign("/");
  };

  return (
    <div className="nav-user" ref={ref}>
      <button type="button" className="nav-user-trigger" aria-haspopup="menu" aria-expanded={open} onClick={() => setOpen(!open)}>
        {image
          // eslint-disable-next-line @next/next/no-img-element -- remote OAuth avatars
          ? <img className="nav-user-avatar" src={image} alt="" />
          : <span className="nav-user-avatar">{(name || email).charAt(0).toUpperCase()}</span>}
        <span className="nav-user-caret">▾</span>
      </button>
      {open && (
        <div className="nav-user-menu" role="menu">
          <div className="nav-user-head">
            <span className="nav-user-name">{name}</span>
            <span className="nav-user-email">{email}</span>
          </div>
          <Link href="/collection" className="nav-user-item" role="menuitem" onClick={() => setOpen(false)}>Your Collection</Link>
          <Link href="/settings" className="nav-user-item" role="menuitem" onClick={() => setOpen(false)}>Settings</Link>
          <button type="button" className="nav-user-item danger" role="menuitem" onClick={signOut}>Sign Out</button>
        </div>
      )}
    </div>
  );
}

function AuthControls() {
  const { data, isPending } = authClient.useSession();
  if (data) return <div className="auth-cta-group"><UserMenu {...data.user} /></div>;
  return (
    // Hidden (not removed) while the session loads so the nav doesn't jump.
    <div className="auth-cta-group" style={isPending ? { visibility: "hidden" } : undefined}>
      <Link href="/login" className="nav-link nav-login">Log In</Link>
      <Link href="/signup" className="nav-link nav-signup">Sign Up</Link>
    </div>
  );
}

export default function SiteNav() {
  return (
    <nav className="site-nav">
      <Link href="/" className="site-nav-brand">
        <span className="logo-main">OtakuVault</span>
        <span className="logo-sub">Personal Collection Tracker</span>
      </Link>
      <div className="site-nav-links">
        <NavLink href="/">Home</NavLink>
        <NavLink href="/collection">Your Collection</NavLink>
        <NavLink href="/index-page">Index</NavLink>
        <NavLink href="/forum">Forum</NavLink>
        <NavLink href="/store">Store</NavLink>
        <AuthControls />
      </div>
    </nav>
  );
}
