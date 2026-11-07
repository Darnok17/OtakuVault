import type { RawSearchParams } from "@/lib/index-filters";
import IndexSections from "../_components/IndexSections";

export default function AnimeIndexPage({ searchParams }: { searchParams: Promise<RawSearchParams> }) {
  return <IndexSections type="anime" searchParams={searchParams} />;
}
