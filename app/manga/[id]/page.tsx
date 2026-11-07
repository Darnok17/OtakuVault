import TitleDetail, { titleMetadata } from "@/app/_components/TitleDetail";

export function generateMetadata({ params }: PageProps<"/manga/[id]">) {
  return titleMetadata("manga", params);
}

export default function MangaPage({ params }: PageProps<"/manga/[id]">) {
  return <TitleDetail type="manga" params={params} />;
}
