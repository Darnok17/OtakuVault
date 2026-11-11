import type { Metadata } from "next";
import { SeasonalBrowsePage } from "@/app/index-page/_components/BrowsePage";
import { parseSeasonSlug, seasonTitle } from "@/lib/browse-sections";

export async function generateMetadata({ params }: PageProps<"/index-page/anime/seasonal/[season]">): Promise<Metadata> {
  const parsed = parseSeasonSlug((await params).season);
  return { title: `${parsed ? seasonTitle(parsed.year, parsed.season) : "Season"} · OtakuVault` };
}

export default function Page({ params }: PageProps<"/index-page/anime/seasonal/[season]">) {
  return <SeasonalBrowsePage params={params} />;
}
