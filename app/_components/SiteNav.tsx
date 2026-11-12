"use client";

import { Suspense, useEffect, useRef, useState, type ReactNode } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { authClient } from "@/lib/auth-client";

function ActiveLink({ href, children }: { href: string; children: ReactNode }) {
  const path = usePathname();
  const active = path === href || (href !== "/" && path.startsWith(`${href}/`));
  return <Link href={href} className={`nav-link ${active ? "active" : ""}`}>{children}</Link>;
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

function UserMenu({ name, email, image, username, isAdmin }: { name: string; email: string; image?: string | null; username?: string | null; isAdmin?: boolean | null }) {
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
          {username && <Link href={`/profile/${username}`} className="nav-user-item" role="menuitem" onClick={() => setOpen(false)}>Your Profile</Link>}
          <Link href="/collection" className="nav-user-item" role="menuitem" onClick={() => setOpen(false)}>Your Collection</Link>
          <Link href="/settings" className="nav-user-item" role="menuitem" onClick={() => setOpen(false)}>Settings</Link>
          {isAdmin && <Link href="/admin/reports" className="nav-user-item" role="menuitem" onClick={() => setOpen(false)}>Forum Reports</Link>}
          <button type="button" className="nav-user-item danger" role="menuitem" onClick={signOut}>Sign Out</button>
        </div>
      )}
    </div>
  );
}

function AuthControls() {
  const { data, isPending } = authClient.useSession();
  if (data) return <div className="auth-cta-group"><UserMenu name={data.user.name} email={data.user.email} image={data.user.avatarUrl ?? data.user.image} username={data.user.username} isAdmin={data.user.isAdmin} /></div>;
  return (
    // Hidden (not removed) while the session loads so the nav doesn't jump.
    <div className="auth-cta-group" style={isPending ? { visibility: "hidden" } : undefined}>
      <Link href="/login" className="nav-link nav-login">Log In</Link>
      <Link href="/signup" className="nav-link nav-signup">Sign Up</Link>
    </div>
  );
}

export default function SiteNav() {
  const ref = useRef<HTMLElement>(null);

  // Publishes the nav's real height as --nav-h. Bars that stick below the nav (the collection's
  // stats bar) use it; the height depends on the theme's type and borders and on wrapping, so a
  // fixed number left those bars tucked under the nav in some themes.
  useEffect(() => {
    const nav = ref.current;
    if (!nav) return;
    const publish = () => document.documentElement.style.setProperty("--nav-h", `${nav.offsetHeight}px`);
    publish();
    const observer = new ResizeObserver(publish);
    observer.observe(nav);
    return () => observer.disconnect();
  }, []);

  return (
    <nav className="site-nav" ref={ref}>
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
