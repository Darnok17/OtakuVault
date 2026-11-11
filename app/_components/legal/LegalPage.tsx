import type { ReactNode } from "react";
import Link from "next/link";

// Shared frame for /terms and /privacy.
export default function LegalPage({ title, kanji, latin, updated, other, children }: {
  title: string; kanji: string; latin: string; updated: string;
  other: { href: string; label: string };
  children: ReactNode;
}) {
  return (
    <main className="ov-page narrow">
      <div className="ov-page-head">
        <nav className="ov-crumbs" aria-label="Breadcrumb">
          <Link href="/">Home</Link><span aria-hidden="true">/</span><span aria-current="page">{title}</span>
        </nav>
        <h1 className="ov-masthead">{title}</h1>
        <div className="ov-kanji" data-latin={latin}>{kanji}</div>
        <p className="ov-meta" style={{ marginTop: ".8rem" }}>Last updated {updated}</p>
      </div>
      <div className="ov-panel legal-note">
        <strong>This is a plain-English summary.</strong> For formal legal terms, see the full agreement, which
        will be published here before OtakuVault opens to the public. Until then this page describes how the
        site actually works, and questions can go to <a className="ov-link" href="mailto:legal@otakuvault.example">legal@otakuvault.example</a>.
      </div>
      <article className="ov-prose">{children}</article>
      <p className="ov-sub" style={{ marginTop: "2.5rem" }}>
        See also: <Link className="ov-link" href={other.href}>{other.label}</Link>
      </p>
    </main>
  );
}
