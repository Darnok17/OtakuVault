import Link from "next/link";

export default function NotFound() {
  return (
    <section className="site-page active td-not-found">
      <div className="td-not-found-code">404</div>
      <p className="td-empty">{"> Nothing in the vault at this address."}</p>
      <Link className="btn btn-ghost" href="/index-page">Browse the Index</Link>
    </section>
  );
}
