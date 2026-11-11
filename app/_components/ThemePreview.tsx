import type { ThemeId } from "@/lib/themes";

// A 300×200 snippet of the home page drawn in the given theme, whatever theme the page around
// it uses: the nested data-theme re-declares every token for this subtree (see app/_themes).
export default function ThemePreview({ theme }: { theme: ThemeId }) {
  return (
    <div className="tp" data-theme={theme} aria-hidden="true">
      <div className="tp-nav">
        <span className="tp-logo">OtakuVault</span>
        <span className="tp-link on" /><span className="tp-link" /><span className="tp-link" />
      </div>
      <div className="tp-hero">
        <div className="tp-title">OtakuVault</div>
        <div className="tp-sub">Track · Discover · Collect</div>
      </div>
      <div className="tp-tiles">
        {([["Collection", "--acc-1"], ["Index", "--acc-3"], ["Store", "--gold"]] as const).map(([name, c]) => (
          <div className="tp-tile" key={name}>
            <span className="tp-tile-icon" style={{ "--c": `var(${c})` } as React.CSSProperties} />
            <span className="tp-tile-name">{name}</span>
            <span className="tp-line" /><span className="tp-line short" />
          </div>
        ))}
      </div>
      <div className="tp-dots">
        <i style={{ background: "var(--acc-1)" }} /><i style={{ background: "var(--acc-2)" }} /><i style={{ background: "var(--acc-3)" }} /><i style={{ background: "var(--gold)" }} />
      </div>
      <span className="tp-cta">Sign up</span>
    </div>
  );
}
