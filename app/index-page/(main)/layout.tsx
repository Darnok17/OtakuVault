import type { ReactNode } from "react";
import IndexHero from "@/app/index-page/_components/IndexHero";

// The hero (search + tabs) stays mounted across the type tabs. The "See more" pages live in the
// sibling (browse) group and get their own, smaller header instead.
export default function IndexMainLayout({ children }: { children: ReactNode }) {
  return <><IndexHero />{children}</>;
}
