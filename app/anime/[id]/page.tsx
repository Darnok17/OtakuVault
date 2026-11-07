import TitleDetail, { titleMetadata } from "@/app/_components/TitleDetail";

export function generateMetadata({ params }: PageProps<"/anime/[id]">) {
  return titleMetadata("anime", params);
}

export default function AnimePage({ params }: PageProps<"/anime/[id]">) {
  return <TitleDetail type="anime" params={params} />;
}
