"use client";

import { useState } from "react";
import Link from "next/link";
import ThemedSelect from "@/app/_components/ThemedSelect";
import { useCartStore } from "@/lib/cart-store";
import { FREE_SHIPPING_FROM, SHIPPING_FLAT, formatPrice } from "@/lib/store-shared";
import { LineItem, Summary, totals } from "./CartClient";
import { useHydrated } from "./StoreBits";

const COUNTRIES = [
  { value: "US", label: "United States" }, { value: "CA", label: "Canada" }, { value: "GB", label: "United Kingdom" },
  { value: "DE", label: "Germany" }, { value: "FR", label: "France" }, { value: "AU", label: "Australia" }, { value: "JP", label: "Japan" },
] as const;
type Country = (typeof COUNTRIES)[number]["value"];

// The checkout screen, built ahead of payments. Nothing typed here is sent or stored anywhere,
// and the pay button stays disabled until Stripe is connected.
export default function CheckoutClient({ email }: { email: string }) {
  const hydrated = useHydrated();
  const stored = useCartStore((s) => s.items);
  const items = hydrated ? stored : [];
  const [country, setCountry] = useState<Country>("US");
  const [delivery, setDelivery] = useState("standard");

  if (!hydrated) return <div className="ov-panel" aria-busy="true"><p className="ov-sub">Loading checkout…</p></div>;
  if (!items.length) {
    return <div className="ov-empty"><strong>Nothing to check out</strong>Your cart is empty. <Link className="ov-link" href="/store">Back to the store</Link>.</div>;
  }
  const { subtotal, total } = totals(items);
  const express = delivery === "express" ? 1400 : 0;

  return (
    <div className="ct co">
      <form className="ov-stack" onSubmit={(e) => e.preventDefault()} noValidate>
        <div className="ov-ok co-soon" role="status">
          <strong>Stripe checkout coming soon.</strong> You can fill this in to see how it will work, but nothing is sent, saved or charged, and orders can&apos;t be placed yet.
        </div>
        <section className="ov-panel">
          <h2 className="ov-title">Contact</h2>
          <div className="ov-field" style={{ marginTop: "1rem", marginBottom: 0 }}>
            <label className="ov-label" htmlFor="co-email">Email for the receipt</label>
            <input id="co-email" className="ov-input" type="email" autoComplete="email" defaultValue={email} placeholder="you@example.com" />
          </div>
        </section>
        <section className="ov-panel">
          <h2 className="ov-title">Shipping address</h2>
          <div className="co-grid">
            <div className="ov-field co-wide"><label className="ov-label" htmlFor="co-name">Full name</label><input id="co-name" className="ov-input" autoComplete="name" /></div>
            <div className="ov-field co-wide"><label className="ov-label" htmlFor="co-addr">Address</label><input id="co-addr" className="ov-input" autoComplete="street-address" /></div>
            <div className="ov-field"><label className="ov-label" htmlFor="co-city">City</label><input id="co-city" className="ov-input" autoComplete="address-level2" /></div>
            <div className="ov-field"><label className="ov-label" htmlFor="co-zip">Postal code</label><input id="co-zip" className="ov-input" autoComplete="postal-code" /></div>
            <div className="ov-field co-wide">
              <span className="ov-label" id="co-country">Country</span>
              <ThemedSelect variant="field" value={country} onChange={setCountry} options={COUNTRIES} aria-labelledby="co-country" />
            </div>
          </div>
        </section>
        <section className="ov-panel">
          <h2 className="ov-title">Delivery</h2>
          <div className="co-radios" role="radiogroup" aria-label="Delivery speed">
            {[
              ["standard", "Standard · 5–8 business days", subtotal >= FREE_SHIPPING_FROM ? "Free" : formatPrice(SHIPPING_FLAT)],
              ["express", "Express · 2–3 business days", `+ ${formatPrice(1400)}`],
            ].map(([id, label, cost]) => (
              <label key={id} className={`co-radio${delivery === id ? " on" : ""}`}>
                <input type="radio" name="delivery" value={id} checked={delivery === id} onChange={() => setDelivery(id)} />
                <span>{label}</span><span className="co-cost">{cost}</span>
              </label>
            ))}
          </div>
        </section>
        <section className="ov-panel co-pay">
          <div className="ov-row between"><h2 className="ov-title">Payment</h2><span className="ov-soon">Coming soon</span></div>
          <p className="ov-sub">Card details will be collected by Stripe on their own secure page. OtakuVault will never see or store your card number.</p>
          <div className="co-card" aria-hidden="true"><span /><span /><span /></div>
        </section>
        <button type="submit" className="btn btn-primary co-submit" disabled aria-describedby="co-why">Pay {formatPrice(total + express)}</button>
        <p className="ov-hint" id="co-why">Payments aren&apos;t switched on yet, so this button doesn&apos;t do anything.</p>
      </form>
      <Summary items={items}>
        {express > 0 && <p className="ov-hint">Express delivery adds {formatPrice(express)}: {formatPrice(total + express)} in all.</p>}
        <ul className="ct-items co-items">{items.map((i) => <LineItem key={i.key} item={i} editable={false} />)}</ul>
        <Link className="ov-link" href="/store/cart">Edit cart</Link>
      </Summary>
    </div>
  );
}
