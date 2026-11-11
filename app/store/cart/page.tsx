import type { Metadata } from "next";
import Link from "next/link";
import CartClient from "../_components/CartClient";

export const metadata: Metadata = { title: "Cart · Store · OtakuVault" };

export default function CartPage() {
  return (
    <main className="ov-page">
      <div className="ov-page-head">
        <nav className="ov-crumbs" aria-label="Breadcrumb"><Link href="/store">Store</Link><span aria-hidden="true">/</span><span aria-current="page">Cart</span></nav>
        <h1 className="ov-masthead">Your cart</h1>
        <div className="ov-kanji" data-latin="Basket">買い物かご</div>
      </div>
      <CartClient />
    </main>
  );
}
