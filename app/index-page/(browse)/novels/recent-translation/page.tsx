import type { Metadata } from "next";
import BrowsePage from "@/app/index-page/_components/BrowsePage";

export const metadata: Metadata = { title: "Recently Translated · OtakuVault" };

export default function Page() {
  return <BrowsePage section="novels/recent-translation" />;
}
