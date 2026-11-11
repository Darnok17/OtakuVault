import type { Metadata } from "next";
import BrowsePage from "@/app/index-page/_components/BrowsePage";

export const metadata: Metadata = { title: "Trending Anime · OtakuVault" };

export default function Page() {
  return <BrowsePage section="anime/trending" />;
}
