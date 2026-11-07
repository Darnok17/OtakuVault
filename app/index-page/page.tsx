import type { RawSearchParams } from "@/lib/index-filters";
import IndexSections from "./_components/IndexSections";

export default function IndexPage({ searchParams }: { searchParams: Promise<RawSearchParams> }) {
  return <IndexSections searchParams={searchParams} />;
}
