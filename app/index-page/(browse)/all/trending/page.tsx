import type { Metadata } from "next";
import BrowsePage from "@/app/index-page/_components/BrowsePage";

export const metadata: Metadata = { title: "Trending Now · OtakuVault" };

export default function Page() {
  return <BrowsePage section="all/trending" />;
}
