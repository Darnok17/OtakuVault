import type { ReactNode } from "react";
import IndexProvider from "./_components/IndexProvider";
import IndexHero from "./_components/IndexHero";

// The hero (search + tabs) and the toast stay mounted across the type tabs.
export default function IndexLayout({ children }: { children: ReactNode }) {
  return (
    <section className="site-page active" id="page-index" data-page="index">
      <IndexProvider>
        <IndexHero />
        {children}
      </IndexProvider>
    </section>
  );
}
