// A user's picture, or their initial on the accent gradient when they have none.
export default function Avatar({ src, name, size }: { src?: string | null; name: string; size?: "sm" | "lg" | "xl" }) {
  const cls = `ov-avatar${size ? ` ${size}` : ""}`;
  return src
    // eslint-disable-next-line @next/next/no-img-element -- uploads and OAuth avatars from arbitrary hosts
    ? <img className={cls} src={src} alt="" loading="lazy" />
    : <span className={cls} aria-hidden="true">{(name.trim() || "?").charAt(0)}</span>;
}
