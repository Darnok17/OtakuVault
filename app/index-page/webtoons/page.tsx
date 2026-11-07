import type { RawSearchParams } from "@/lib/index-filters";
import IndexSections from "../_components/IndexSections";

export default function WebtoonsIndexPage({ searchParams }: { searchParams: Promise<RawSearchParams> }) {
  return <IndexSections type="webtoon" searchParams={searchParams} />;
}
