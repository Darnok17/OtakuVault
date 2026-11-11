import { Suspense } from "react";
import HomeClient from "./_components/HomeClient";
import { BoardData, BoardFallback, DiscoverFallback, DiscoverFan, TrackFallback, TrackTiles } from "./_components/home/HomeData";

// The shell is static; the three demos stream in with real AniList data.
export default function Page() {
  return (
    <HomeClient
      track={<Suspense fallback={<TrackFallback />}><TrackTiles /></Suspense>}
      board={<Suspense fallback={<BoardFallback />}><BoardData /></Suspense>}
      discover={<Suspense fallback={<DiscoverFallback />}><DiscoverFan /></Suspense>}
    />
  );
}
