"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { resolveReport } from "@/app/actions/forum";

export default function ReportActions({ reportId, postGone }: { reportId: string; postGone: boolean }) {
  const router = useRouter();
  const [busy, setBusy] = useState<"dismiss" | "delete" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const act = async (action: "dismiss" | "delete") => {
    setBusy(action); setError(null);
    const res = await resolveReport(reportId, action).catch(() => ({ ok: false as const, error: "That didn't go through. Try again." }));
    setBusy(null);
    if (!res.ok) return setError(res.error);
    router.refresh();
  };
  return (
    <>
      <div className="ov-row">
        {!postGone && <button type="button" className="btn btn-primary" disabled={!!busy} onClick={() => act("delete")}>{busy === "delete" ? "Deleting…" : "Delete post"}</button>}
        <button type="button" className="btn btn-ghost" disabled={!!busy} onClick={() => act("dismiss")}>{busy === "dismiss" ? "Dismissing…" : "Dismiss report"}</button>
      </div>
      {error && <div className="ov-error" role="alert">{error}</div>}
    </>
  );
}
