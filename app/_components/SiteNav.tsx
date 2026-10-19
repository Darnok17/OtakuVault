"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

export default function SiteNav() {
  const path = usePathname();
  const isActive = (href: string) => path === href;
  const linkClass = (href: string) =>
    `nav-link ${isActive(href) ? "active" : ""}`;

  return (
    <nav className="site-nav">
      <Link href="/" className="site-nav-brand">
        <span className="logo-main">OtakuVault</span>
        <span className="logo-sub">Personal Collection Tracker</span>
      </Link>
      <div className="site-nav-links">
        <Link href="/" className={linkClass("/")}>Home</Link>
        <Link href="/collection" className={linkClass("/collection")}>Your Collection</Link>
        <Link href="/index-page" className={linkClass("/index-page")}>Index</Link>
        <Link href="/forum" className={linkClass("/forum")}>Forum</Link>
        <Link href="/store" className={linkClass("/store")}>Store</Link>
        <div className="auth-cta-group">
          <Link href="/login" className="nav-link nav-login">Log In</Link>
          <Link href="/signup" className="nav-link nav-signup">Sign Up</Link>
        </div>
      </div>
    </nav>
  );
}