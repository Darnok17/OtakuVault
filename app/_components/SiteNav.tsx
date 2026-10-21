"use client";

import { Suspense, type ReactNode } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";

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
        <div className="auth-cta-group">
          <Link href="/login" className="nav-link nav-login">Log In</Link>
          <Link href="/signup" className="nav-link nav-signup">Sign Up</Link>
        </div>
      </div>
    </nav>
  );
}
