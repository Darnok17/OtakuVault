import type { RawSearchParams } from "@/lib/index-filters";
import IndexSections from "../_components/IndexSections";

export default function MangaIndexPage({ searchParams }: { searchParams: Promise<RawSearchParams> }) {
  return <IndexSections type="manga" searchParams={searchParams} />;
}
