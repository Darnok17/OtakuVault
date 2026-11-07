import TitleDetail, { titleMetadata } from "@/app/_components/TitleDetail";

export function generateMetadata({ params }: PageProps<"/novels/[id]">) {
  return titleMetadata("novel", params);
}

export default function NovelPage({ params }: PageProps<"/novels/[id]">) {
  return <TitleDetail type="novel" params={params} />;
}
