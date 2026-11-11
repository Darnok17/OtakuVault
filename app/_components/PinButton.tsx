"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import Toast from "@/app/_components/Toast";
import { authClient } from "@/lib/auth-client";
import { isPinned, usePinsStore } from "@/lib/pins-store";
import type { PinKind } from "@/lib/types";

const noSubscribe = () => () => {};
const NOUN: Record<PinKind, string> = { entry: "entry", moodboard: "moodboard", forum_thread: "thread", product: "product" };

// Pin / unpin something on your profile. Filled = pinned. Shows nothing while signed out unless
// `showSignedOut`, in which case a click explains that pinning needs an account.
export default function PinButton({ kind, targetId, label, className = "ov-icon-btn", showSignedOut = false, withText = false }: {
  kind: PinKind; targetId: string; label?: string; className?: string; showSignedOut?: boolean; withText?: boolean;
}) {
  const { data: session } = authClient.useSession();
  // The session may already be loaded when streamed content hydrates, while the server rendered
  // signed-out markup; render as signed out until hydration is done so the two match.
  const hydrated = useSyncExternalStore(noSubscribe, () => true, () => false);
  const userId = hydrated ? session?.user.id ?? null : null;
  const pinned = usePinsStore((s) => isPinned(s, kind, targetId));
  const load = usePinsStore((s) => s.load);
  const toggle = usePinsStore((s) => s.toggle);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);

  useEffect(() => { if (userId) void load(userId); }, [userId, load]);
  useEffect(() => () => clearTimeout(timer.current), []);

  if (!userId && !showSignedOut) return null;

  const say = (message: string) => {
    clearTimeout(timer.current);
    setNote(message);
    timer.current = setTimeout(() => setNote(null), 2600);
  };

  const onClick = async (e: React.MouseEvent) => {
    e.preventDefault(); e.stopPropagation();
    if (!userId) return say("Log in to pin things to your profile");
    if (busy) return;
    setBusy(true);
    const res = await toggle(kind, targetId);
    setBusy(false);
    say(res.error ?? (res.pinned ? "Pinned to your profile" : "Unpinned from your profile"));
  };

  const what = label ?? `this ${NOUN[kind]}`;
  return (
    <>
      <button
        type="button" className={`${className} pin-btn`} aria-pressed={pinned} disabled={busy}
        title={pinned ? "Unpin from profile" : "Pin to profile"}
        aria-label={pinned ? `Unpin ${what} from your profile` : `Pin ${what} to your profile`}
        onClick={onClick}
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill={pinned ? "currentColor" : "none"} stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M9 3h6l-1 6 4 4v2H6v-2l4-4-1-6Z" /><path d="M12 15v6" />
        </svg>
        {withText && <span>{pinned ? "Pinned" : "Pin"}</span>}
      </button>
      <Toast message={note} />
    </>
  );
}
