import type { ReactNode } from "react";

// A small, dependency-free Markdown renderer for bios and forum posts. It builds React elements
// (never HTML strings), so nothing a user types can become markup. Supported: **bold**,
// *italic*, `code`, [text](https://link), bare links, > quotes, ``` code blocks, - and 1. lists.

const SAFE_URL = /^https?:\/\/[^\s<>"']+$/i;

// Inline pass. Order matters: code first so its contents stay literal.
const INLINE = /(`[^`\n]+`)|(\*\*[^*\n]+?\*\*)|(\*[^*\s][^*\n]*?\*)|(_[^_\s][^_\n]*?_)|(\[[^\]\n]+\]\([^)\s]+\))|(https?:\/\/[^\s<>"')\]]+)/g;

function inline(text: string, key: string): ReactNode[] {
  const out: ReactNode[] = [];
  let last = 0, n = 0;
  for (const m of text.matchAll(INLINE)) {
    const i = m.index ?? 0;
    if (i > last) out.push(text.slice(last, i));
    const tok = m[0], k = `${key}-${n++}`;
    if (m[1]) out.push(<code key={k}>{tok.slice(1, -1)}</code>);
    else if (m[2]) out.push(<strong key={k}>{inline(tok.slice(2, -2), k)}</strong>);
    else if (m[3] || m[4]) out.push(<em key={k}>{inline(tok.slice(1, -1), k)}</em>);
    else if (m[5]) {
      const [, label, url] = /^\[([^\]]+)\]\(([^)]+)\)$/.exec(tok)!;
      out.push(SAFE_URL.test(url) ? <a key={k} href={url} target="_blank" rel="noopener noreferrer nofollow ugc">{label}</a> : tok);
    } else {
      // Trailing punctuation belongs to the sentence, not the link.
      const url = tok.replace(/[.,;:!?]+$/, "");
      out.push(<a key={k} href={url} target="_blank" rel="noopener noreferrer nofollow ugc">{url}</a>, tok.slice(url.length));
    }
    last = i + tok.length;
  }
  if (last < text.length) out.push(text.slice(last));
  return out;
}

// Lines of a paragraph keep their breaks, as people expect from a comment box.
function lines(block: string[], key: string): ReactNode[] {
  return block.flatMap((l, i) => (i ? [<br key={`${key}-br${i}`} />, ...inline(l, `${key}-${i}`)] : inline(l, `${key}-${i}`)));
}

export function Markdown({ text, className = "" }: { text: string; className?: string }) {
  const src = text.replace(/\r\n?/g, "\n").split("\n");
  const blocks: ReactNode[] = [];
  let i = 0;
  const key = () => `b${blocks.length}`;
  while (i < src.length) {
    const line = src[i];
    if (!line.trim()) { i++; continue; }
    if (line.startsWith("```")) {
      const code: string[] = [];
      for (i++; i < src.length && !src[i].startsWith("```"); i++) code.push(src[i]);
      i++;
      blocks.push(<pre key={key()}><code>{code.join("\n")}</code></pre>);
    } else if (/^>\s?/.test(line)) {
      const quote: string[] = [];
      for (; i < src.length && /^>\s?/.test(src[i]); i++) quote.push(src[i].replace(/^>\s?/, ""));
      blocks.push(<blockquote key={key()}>{lines(quote, key())}</blockquote>);
    } else if (/^\s*[-*]\s+/.test(line)) {
      const items: string[] = [];
      for (; i < src.length && /^\s*[-*]\s+/.test(src[i]); i++) items.push(src[i].replace(/^\s*[-*]\s+/, ""));
      const k = key();
      blocks.push(<ul key={k}>{items.map((it, n) => <li key={n}>{inline(it, `${k}-${n}`)}</li>)}</ul>);
    } else if (/^\s*\d+[.)]\s+/.test(line)) {
      const items: string[] = [];
      for (; i < src.length && /^\s*\d+[.)]\s+/.test(src[i]); i++) items.push(src[i].replace(/^\s*\d+[.)]\s+/, ""));
      const k = key();
      blocks.push(<ol key={k}>{items.map((it, n) => <li key={n}>{inline(it, `${k}-${n}`)}</li>)}</ol>);
    } else {
      const para: string[] = [];
      for (; i < src.length && src[i].trim() && !/^(```|>\s?|\s*[-*]\s+|\s*\d+[.)]\s+)/.test(src[i]); i++) para.push(src[i]);
      const k = key();
      blocks.push(<p key={k}>{lines(para, k)}</p>);
    }
  }
  return <div className={`ov-md ${className}`}>{blocks}</div>;
}

// Plain-text excerpt for lists and cards.
export function excerpt(text: string, max = 160) {
  const plain = text
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
    .replace(/[*_`>#]/g, "")
    .replace(/\s+/g, " ")
    .trim();
  return plain.length > max ? `${plain.slice(0, max - 1).trimEnd()}…` : plain;
}
