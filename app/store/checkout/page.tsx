import { Suspense } from "react";
import type { Metadata } from "next";
import Link from "next/link";
import { headers } from "next/headers";
import { auth } from "@/lib/auth";
import CheckoutClient from "../_components/CheckoutClient";

export const metadata: Metadata = { title: "Checkout · Store · OtakuVault" };

// Guests can look at checkout too; a signed-in member's email is filled in for them.
async function Checkout() {
  const session = await auth.api.getSession({ headers: await headers() });
  return <CheckoutClient email={session?.user.email ?? ""} />;
}

export default function CheckoutPage() {
  return (
    <main className="ov-page">
      <div className="ov-page-head">
        <nav className="ov-crumbs" aria-label="Breadcrumb">
          <Link href="/store">Store</Link><span aria-hidden="true">/</span><Link href="/store/cart">Cart</Link><span aria-hidden="true">/</span><span aria-current="page">Checkout</span>
        </nav>
        <h1 className="ov-masthead">Checkout</h1>
        <div className="ov-kanji" data-latin="Payment">お会計</div>
      </div>
      <Suspense fallback={<div className="ov-panel" aria-busy="true"><p className="ov-sub">Loading checkout…</p></div>}>
        <Checkout />
      </Suspense>
    </main>
  );
}
