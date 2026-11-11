import type { ReactNode } from "react";
import IndexProvider from "./_components/IndexProvider";

// Everything under /index-page shares the provider (the "added to collection" toast); the hero
// belongs to the (main) group only.
export default function IndexLayout({ children }: { children: ReactNode }) {
  return (
    <section className="site-page active" id="page-index" data-page="index">
      <IndexProvider>{children}</IndexProvider>
    </section>
  );
}
