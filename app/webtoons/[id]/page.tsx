import TitleDetail, { titleMetadata } from "@/app/_components/TitleDetail";

export function generateMetadata({ params }: PageProps<"/webtoons/[id]">) {
  return titleMetadata("webtoon", params);
}

export default function WebtoonPage({ params }: PageProps<"/webtoons/[id]">) {
  return <TitleDetail type="webtoon" params={params} />;
}
