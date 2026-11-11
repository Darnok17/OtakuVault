import { Suspense } from "react";
import type { Metadata } from "next";
import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { eq } from "drizzle-orm";
import { auth } from "@/lib/auth";
import { db, users } from "@/lib/db";
import { countView, getThread } from "@/lib/forum";
import ThreadClient from "../_components/ThreadClient";

export const metadata: Metadata = { title: "Thread · Forum · OtakuVault" };

async function Thread({ params }: PageProps<"/forum/[threadId]">) {
  const [{ threadId }, session] = await Promise.all([params, auth.api.getSession({ headers: await headers() })]);
  // Moderator rights come from the database row, not from whatever the session cached.
  const [me] = session ? await db.select({ id: users.id, isAdmin: users.isAdmin }).from(users).where(eq(users.id, session.user.id)) : [];
  const thread = await getThread(threadId, me?.id ?? null);
  if (!thread) notFound();
  await countView(thread.id).catch(() => {});
  return <ThreadClient thread={thread} viewer={me ?? null} />;
}

export default function ThreadPage(props: PageProps<"/forum/[threadId]">) {
  return (
    <main className="ov-page narrow fp-page">
      <Suspense fallback={<div className="ov-panel" aria-busy="true"><p className="ov-sub">Loading thread…</p></div>}>
        <Thread {...props} />
      </Suspense>
    </main>
  );
}
