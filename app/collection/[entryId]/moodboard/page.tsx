import { Suspense } from "react";
import MoodboardShell from "./_components/MoodboardShell";

type Params = Promise<{ entryId: string }>;

// params is request-time data under Cache Components, so it's read inside a Suspense boundary.
export default function MoodboardPage({ params }: { params: Params }) {
  return (
    <Suspense fallback={<div className="board-overlay open"></div>}>
      <Moodboard params={params} />
    </Suspense>
  );
}

async function Moodboard({ params }: { params: Params }) {
  const { entryId } = await params;
  return <MoodboardShell entryId={entryId} />;
}
