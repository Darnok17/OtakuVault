// A product picture: the uploaded image when there is one, otherwise a drawn mockup of the
// product type in the product's accent colour, with its glyph where the print would go.
// `tint` recolours the item itself (a colour variant).

const Glyph = ({ x = 100, y, size = 44, children }: { x?: number; y: number; size?: number; children: string }) => (
  <text className="pm-glyph" x={x} y={y} fontSize={size} textAnchor="middle" dominantBaseline="central">{children}</text>
);

function Mockup({ cat, glyph }: { cat: string; glyph: string }) {
  switch (cat) {
    case "apparel":
      return <>
        <path className="pm-body" d="M62 38 84 28q16 16 32 0l22 10 34 34-22 22-12-12v92H62V82L50 94 28 72Z" />
        <path className="pm-line" d="M84 28q16 16 32 0" />
        <Glyph y={112}>{glyph}</Glyph>
      </>;
    case "poster":
      return <>
        <rect className="pm-body" x="48" y="22" width="104" height="156" />
        <rect className="pm-line" x="58" y="32" width="84" height="136" />
        <Glyph y={92} size={54}>{glyph}</Glyph>
        <path className="pm-line" d="M72 138h56M80 150h40" />
      </>;
    case "figure":
      return <>
        <ellipse className="pm-accent" cx="100" cy="172" rx="58" ry="11" />
        <path className="pm-body" d="M100 26a20 20 0 1 1 0 40 20 20 0 0 1 0-40ZM70 78q30-14 60 0l10 52-18 4-4 36H82l-4-36-18-4Z" />
        <Glyph y={108} size={34}>{glyph}</Glyph>
      </>;
    case "artbook":
      return <>
        <rect className="pm-body" x="44" y="28" width="112" height="146" rx="3" />
        <path className="pm-line" d="M58 28v146" />
        <rect className="pm-accent" x="72" y="132" width="70" height="8" />
        <Glyph x={107} y={86} size={52}>{glyph}</Glyph>
      </>;
    case "manga":
      return <>
        <rect className="pm-accent" x="34" y="44" width="84" height="130" rx="2" />
        <rect className="pm-body pm-dim" x="48" y="36" width="84" height="130" rx="2" />
        <rect className="pm-body" x="64" y="28" width="92" height="146" rx="2" />
        <path className="pm-line" d="M76 28v146" />
        <Glyph x={116} y={96} size={48}>{glyph}</Glyph>
      </>;
    case "plush":
      return <>
        <circle className="pm-body" cx="62" cy="60" r="20" /><circle className="pm-body" cx="138" cy="60" r="20" />
        <circle className="pm-body" cx="100" cy="112" r="62" />
        <circle className="pm-dot" cx="80" cy="96" r="5" /><circle className="pm-dot" cx="120" cy="96" r="5" />
        <path className="pm-line" d="M90 112q10 9 20 0" />
        <Glyph y={146} size={26}>{glyph}</Glyph>
      </>;
    default: // accessory and anything new
      return <>
        <circle className="pm-line pm-ring" cx="100" cy="40" r="17" />
        <path className="pm-line" d="M100 57v20" />
        <rect className="pm-body" x="62" y="76" width="76" height="98" rx="14" />
        <Glyph y={126} size={46}>{glyph}</Glyph>
      </>;
  }
}

export default function ProductArt({ cat, glyph, imageUrl, tint }: { cat: string; glyph: string; imageUrl?: string | null; tint?: string | null }) {
  if (imageUrl) return <div className="pm pm-photo" style={{ backgroundImage: `url(${JSON.stringify(imageUrl)})` }} role="img" aria-label="Product photo" />;
  return (
    <svg className="pm" viewBox="0 0 200 200" aria-hidden="true" style={tint ? ({ "--pm-tint": tint } as React.CSSProperties) : undefined} data-tinted={tint ? "" : undefined}>
      <Mockup cat={cat} glyph={glyph} />
    </svg>
  );
}
