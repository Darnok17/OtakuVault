import type { Metadata } from "next";
import BrowsePage from "@/app/index-page/_components/BrowsePage";

export const metadata: Metadata = { title: "New Webtoons This Week · OtakuVault" };

export default function Page() {
  return <BrowsePage section="webtoons/new" />;
}
