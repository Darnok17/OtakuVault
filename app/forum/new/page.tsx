import { Suspense } from "react";
import type { Metadata } from "next";
import Link from "next/link";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { getAttachables } from "@/app/actions/forum";
import { isForumCategory } from "@/lib/forum-shared";
import NewThreadForm from "../_components/NewThreadForm";

export const metadata: Metadata = { title: "New thread · Forum · OtakuVault" };

async function Form({ searchParams }: PageProps<"/forum/new">) {
  const [query, session] = await Promise.all([searchParams, auth.api.getSession({ headers: await headers() })]);
  if (!session) redirect("/login?redirect=/forum/new");
  return <NewThreadForm attachables={await getAttachables()} defaultCat={isForumCategory(query.cat) ? query.cat : "general"} />;
}

export default function NewThreadPage(props: PageProps<"/forum/new">) {
  return (
    <main className="ov-page narrow">
      <div className="ov-page-head">
        <nav className="ov-crumbs" aria-label="Breadcrumb">
          <Link href="/forum">Forum</Link><span aria-hidden="true">/</span><span aria-current="page">New thread</span>
        </nav>
        <h1 className="ov-masthead">New thread</h1>
        <div className="ov-kanji" data-latin="New thread">新規スレッド</div>
      </div>
      <Suspense fallback={<div className="ov-panel" aria-busy="true"><p className="ov-sub">Loading…</p></div>}>
        <Form {...props} />
      </Suspense>
    </main>
  );
}
