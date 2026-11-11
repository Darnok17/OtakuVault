import type { RawSearchParams } from "@/lib/index-filters";
import IndexSections from "@/app/index-page/_components/IndexSections";

export default function MangaIndexPage({ searchParams }: { searchParams: Promise<RawSearchParams> }) {
  return <IndexSections type="manga" searchParams={searchParams} />;
}
