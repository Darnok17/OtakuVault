import { Suspense, type ReactNode } from "react";
import Link from "next/link";
import { headers } from "next/headers";
import { notFound, redirect } from "next/navigation";
import { connection } from "next/server";
import IndexProvider from "@/app/index-page/_components/IndexProvider";
import { RecRow } from "@/app/index-page/_components/posters";
import { getTitleDetails } from "@/lib/anilist";
import {
  SEASON_INFO, TITLE_ROUTES, dedupeDetails, descriptionParagraphs, titleHref, uniqueBy,
  type DetailsResult, type FuzzyDate, type TitleCharacter, type TitleDetails, type TitleStaff, type TitleVoiceActor,
} from "@/lib/anilist-shared";
import { auth } from "@/lib/auth";
import { findCollectionEntry, toEntry } from "@/lib/entries-db";
import { BROWSE_GENRES } from "@/lib/index-filters";
import type { EntryType } from "@/lib/types";
import ShowMore from "./title/ShowMore";
import TitleActions from "./title/TitleActions";
import TitleDescription from "./title/TitleDescription";

// The detail page behind /anime/[id], /manga/[id], /webtoons/[id] and /novels/[id]. The title
// comes from one AniList query, so the page has two streamed holes in a static shell: the title
// itself, and the signed-in action row.

const NOT_AVAILABLE = "Information not currently available";
const CAST_SHOWN = 12;
const STAFF_SHOWN = 12;
const TAGS_SHOWN = 10;

type Params = Promise<{ id: string }>;

/* ---------- Lookup ---------- */

// Numeric ids only; anything else (or out of range) is a 404 without asking AniList.
export function parseTitleId(id: string) {
  const n = /^\d{1,8}$/.test(id) ? Number(id) : 0;
  return n >= 1 && n <= 10_000_000 ? n : null;
}

async function lookup(type: EntryType, id: string): Promise<DetailsResult | "error"> {
  const anilistId = parseTitleId(id);
  if (!anilistId) notFound();
  await connection();
  return getTitleDetails(anilistId, type).catch(() => "error" as const);
}

/* ---------- Formatting ---------- */

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

function formatDate(d: FuzzyDate | null) {
  if (!d?.year) return null;
  if (!d.month) return `${d.year}`;
  return d.day ? `${MONTHS[d.month - 1]} ${d.day}, ${d.year}` : `${MONTHS[d.month - 1]} ${d.year}`;
}

// AniList enums: TV_SHORT → "TV Short", LIGHT_NOVEL → "Light Novel", OVA stays "OVA".
function enumLabel(v: string | null) {
  if (!v) return null;
  return v.split("_").map((w) => (w.length <= 3 ? w : w[0] + w.slice(1).toLowerCase())).join(" ");
}

function statusLabel(d: TitleDetails) {
  if (d.status === "RELEASING") return d.kind === "ANIME" ? "Airing" : "Releasing";
  if (d.status === "NOT_YET_RELEASED") return "Upcoming";
  return enumLabel(d.status);
}

const count = (n: number | null) => n?.toLocaleString("en-US") ?? null;

const FLAGS: Record<string, string> = {
  Japanese: "🇯🇵", English: "🇺🇸", Korean: "🇰🇷", Chinese: "🇨🇳", Mandarin: "🇨🇳", Italian: "🇮🇹", Spanish: "🇪🇸", Portuguese: "🇧🇷",
  French: "🇫🇷", German: "🇩🇪", Hebrew: "🇮🇱", Hungarian: "🇭🇺", Arabic: "🇸🇦", Filipino: "🇵🇭", Tagalog: "🇵🇭", Finnish: "🇫🇮",
  Turkish: "🇹🇷", Dutch: "🇳🇱", Swedish: "🇸🇪", Thai: "🇹🇭", Polish: "🇵🇱", Russian: "🇷🇺", Hindi: "🇮🇳", Vietnamese: "🇻🇳", Indonesian: "🇮🇩",
};

function Flag({ language }: { language: string | null }) {
  return <span className="td-flag" role="img" title={language ?? undefined} aria-label={language ?? "Unknown language"}>{(language && FLAGS[language]) ?? "🌐"}</span>;
}

function Img({ src, className }: { src: string | null; className: string }) {
  // eslint-disable-next-line @next/next/no-img-element -- remote AniList images, as on the Index page
  return src ? <img className={className} src={src} alt="" loading="lazy" /> : <div className={`${className} td-img-empty`} aria-hidden="true" />;
}

/* ---------- Sections ---------- */

function Section({ title, kanji, accent = "teal", children }: { title: string; kanji: string; accent?: string; children?: ReactNode }) {
  return (
    <section className="idx-section td-section" data-accent={accent}>
      <div className="idx-section-header">
        <h2 className="idx-section-title">{title} <span className="idx-section-kanji" data-latin="❧">{kanji}</span></h2>
      </div>
      {children || <p className="td-empty">{NOT_AVAILABLE}</p>}
    </section>
  );
}

function Hero({ d }: { d: TitleDetails }) {
  const art = d.banner ?? d.cover;
  return (
    <div className="td-hero">
      {art && <div className={`td-hero-art ${d.banner ? "" : "td-hero-art-blur"}`} style={{ backgroundImage: `url(${JSON.stringify(art)})` }} aria-hidden="true" />}
      <div className="td-hero-inner">
        <Img src={d.cover} className="td-cover" />
        <div className="td-title-block">
          <h1 className="td-title">{d.romaji}</h1>
          {d.english && d.english !== d.romaji && <div className="td-title-en">{d.english}</div>}
          {d.native && <div className="td-title-native" lang="ja">{d.native}</div>}
          <div className="td-chips">
            {d.status && <span className="td-pill" data-status={d.status}>{statusLabel(d)}</span>}
            {d.averageScore != null && <span className="td-chip">★ {d.averageScore}%</span>}
            {d.popularity != null && <span className="td-chip">♥ {count(d.popularity)}</span>}
          </div>
        </div>
      </div>
    </div>
  );
}

function Stats({ d }: { d: TitleDetails }) {
  const length: [string, number | null] =
    d.entryType === "anime" ? ["Episodes", d.episodes] : d.entryType === "novel" ? ["Volumes", d.volumes] : ["Chapters", d.chapters];
  const stats: [string, string | number | null][] = [
    ["Score", d.averageScore],
    ["Popularity", d.popularityRank ? `#${count(d.popularityRank)}` : count(d.popularity)],
    ["Format", enumLabel(d.format)],
    ["Status", statusLabel(d)],
    length,
    ...(d.entryType === "anime" ? [["Duration", d.duration ? `${d.duration} min` : null] as [string, string | null]] : []),
    ["Start Date", formatDate(d.startDate)],
    ...(d.status === "FINISHED" ? [["End Date", formatDate(d.endDate)] as [string, string | null]] : []),
  ];
  return (
    <div className="td-stats-strip">
      {stats.map(([label, value]) => (
        <div className="td-stat" key={label}>
          <div className="td-stat-label">{label}</div>
          <div className="td-stat-value">{value ?? "—"}</div>
        </div>
      ))}
    </div>
  );
}

function Row({ label, children }: { label: string; children: ReactNode }) {
  return <div className="td-meta-row"><div className="td-meta-label">{label}</div><div className="td-meta-value">{children}</div></div>;
}

function Metadata({ d }: { d: TitleDetails }) {
  const route = TITLE_ROUTES[d.entryType];
  const tags = [...d.tags].sort((a, b) => b.rank - a.rank).slice(0, TAGS_SHOWN);
  const studios = [...d.studios].sort((a, b) => Number(b.isMain) - Number(a.isMain));
  const creators = d.entryType === "anime" ? [] : d.staff.filter((s) => /story|art|illustration/i.test(s.role ?? ""));
  const season = d.season && d.seasonYear ? `${SEASON_INFO[d.season].label} ${d.seasonYear}` : null;

  const rows = [
    d.genres.length > 0 && (
      <Row label="Genres" key="genres">
        {d.genres.map((g) => (BROWSE_GENRES.includes(g)
          // Genres the Index can't filter on have nowhere to link to.
          ? <Link className="td-tag" key={g} href={`/index-page/${route}?genre=${g.toLowerCase().replace(/\s+/g, "-")}`}>{g}</Link>
          : <span className="td-tag" key={g}>{g}</span>))}
      </Row>
    ),
    tags.length > 0 && <Row label="Tags" key="tags">{tags.map((t) => <span className="td-tag td-tag-sm" key={t.name}>{t.name}</span>)}</Row>,
    d.entryType === "anime" && studios.length > 0 && (
      <Row label="Studios" key="studios">
        {studios.map((s) => <span className={s.isMain ? "td-studio-main" : "td-studio"} key={s.name}>{s.name}</span>)}
      </Row>
    ),
    creators.length > 0 && (
      <Row label="Author / Artist" key="creators">
        {creators.map((s) => <span className="td-studio" key={`${s.id}-${s.role}`}>{s.name} <span className="td-faint">{s.role}</span></span>)}
      </Row>
    ),
    d.source && <Row label="Source" key="source">{enumLabel(d.source)}</Row>,
    season && <Row label="Season" key="season">{season}</Row>,
    d.meanScore != null && <Row label="Mean Score" key="mean">{d.meanScore}%</Row>,
    d.favourites != null && <Row label="Favourites" key="fav">{count(d.favourites)}</Row>,
    d.synonyms.length > 0 && <Row label="Also Known As" key="syn">{d.synonyms.join(" · ")}</Row>,
  ].filter(Boolean);

  return <Section title="Details" kanji="詳細">{rows.length > 0 && <div className="td-meta-grid">{rows}</div>}</Section>;
}

function VoiceActor({ va }: { va: TitleVoiceActor }) {
  return (
    <div className="td-va">
      <div className="td-va-text">
        <div className="td-va-name">{va.name}</div>
        <Flag language={va.language} />
      </div>
      <Img src={va.image} className="td-va-img" />
    </div>
  );
}

function CharacterCard({ c }: { c: TitleCharacter }) {
  // Japanese leads where it exists; the other dubs stack underneath as small tags.
  const lead = c.voiceActors.find((v) => v.language === "Japanese") ?? c.voiceActors[0];
  const others = c.voiceActors.filter((v) => v !== lead);
  return (
    <div className="td-char-card">
      <div className="td-char-main">
        <Img src={c.image} className="td-char-img" />
        <div className="td-char-text">
          <div className="td-char-name">{c.name}</div>
          <div className="td-char-role">{enumLabel(c.role)}</div>
        </div>
        {lead && <VoiceActor va={lead} />}
      </div>
      {others.length > 0 && (
        <div className="td-va-tags">
          {others.map((v) => <span className="td-va-tag" key={v.id}><Flag language={v.language} /> {v.name}</span>)}
        </div>
      )}
    </div>
  );
}

const KEY_ROLE = /^(director|original creator|music|character design|screenplay)/i;

function StaffRow({ s }: { s: TitleStaff }) {
  return (
    <div className={`td-staff-row ${KEY_ROLE.test(s.role ?? "") ? "td-staff-key" : ""}`}>
      <Img src={s.image} className="td-staff-img" />
      <div>
        <div className="td-staff-name">{s.name}</div>
        <div className="td-staff-role">{s.role}</div>
      </div>
    </div>
  );
}

function Relations({ d }: { d: TitleDetails }) {
  return (
    <Section title="Relations" kanji="関連作品" accent="violet">
      {d.relations.length > 0 && (
        <div className="td-relations">
          {d.relations.map((r) => (
            <Link className="td-relation" href={titleHref(r.entryType, r.id)} key={`${r.id}-${r.relationType}`}>
              <Img src={r.cover} className="td-relation-img" />
              <div className="td-relation-text">
                <div className="td-relation-type">{enumLabel(r.relationType)}</div>
                <div className="td-relation-title">{r.title}</div>
                <div className="td-faint">{enumLabel(r.format)}</div>
              </div>
            </Link>
          ))}
        </div>
      )}
    </Section>
  );
}

function Trailer({ d }: { d: TitleDetails }) {
  const id = d.trailer?.site === "youtube" && /^[\w-]{6,20}$/.test(d.trailer.id) ? d.trailer.id : null;
  return (
    <Section title="Trailer" kanji="予告編" accent="crimson">
      {id && (
        <div className="td-trailer">
          <iframe src={`https://www.youtube-nocookie.com/embed/${id}`} title={`${d.title} trailer`} loading="lazy" allow="encrypted-media; picture-in-picture" allowFullScreen />
        </div>
      )}
    </Section>
  );
}

function ExternalLinks({ d }: { d: TitleDetails }) {
  const links = uniqueBy([
    ...(d.siteUrl ? [{ url: d.siteUrl, site: "AniList", language: null, icon: null }] : []),
    ...(d.idMal ? [{ url: `https://myanimelist.net/${d.kind.toLowerCase()}/${d.idMal}`, site: "MyAnimeList", language: null, icon: null }] : []),
    ...d.externalLinks,
  ], (l) => l.url);
  return (
    <Section title="External Links" kanji="外部リンク" accent="gold">
      {links.length > 0 && (
        <div className="td-links">
          {links.map((l) => (
            <a className="td-link" href={l.url} target="_blank" rel="noopener noreferrer" key={l.url}>
              {/* eslint-disable-next-line @next/next/no-img-element -- remote AniList icons */}
              {l.icon && <img src={l.icon} alt="" loading="lazy" />}
              {l.language ? `${l.site} (${l.language})` : l.site}
            </a>
          ))}
        </div>
      )}
    </Section>
  );
}

/* ---------- Action row ---------- */

async function ActionRow({ d }: { d: TitleDetails }) {
  const session = await auth.api.getSession({ headers: await headers() });
  const userId = session?.user.id ?? null;
  const row = userId ? await findCollectionEntry(userId, d.anilistId, d.entryType, [d.title, d.romaji, d.native]) : null;
  return <TitleActions anilistId={d.anilistId} type={d.entryType} title={d.title} userId={userId} initialEntry={row && toEntry(row)} />;
}

/* ---------- Page ---------- */

async function TitleContent({ type, params }: { type: EntryType; params: Params }) {
  const { id } = await params;
  const result = await lookup(type, id);
  if (result === "error") return <p className="td-empty td-unreachable">{"> AniList is unreachable right now — try again in a moment."}</p>;
  if (result.status === "not-found") notFound();
  // Same id, other route (e.g. a manhwa opened under /manga): send it to the right one.
  if (result.status === "wrong-type") redirect(titleHref(result.entryType, Number(id)));

  const d = dedupeDetails(result.details);
  const paragraphs = descriptionParagraphs(d.description);
  const staff = [...d.staff].sort((a, b) => Number(KEY_ROLE.test(b.role ?? "")) - Number(KEY_ROLE.test(a.role ?? "")));

  return (
    <IndexProvider>
      <Hero d={d} />
      <div className="td-body">
        <Suspense fallback={<div className="td-actions td-actions-loading" aria-hidden="true" />}>
          <ActionRow d={d} />
        </Suspense>
        <Stats d={d} />
        <Section title="Synopsis" kanji="あらすじ">{paragraphs.length > 0 && <TitleDescription paragraphs={paragraphs} />}</Section>
        <Metadata d={d} />
        <Section title="Characters" kanji="登場人物" accent="crimson">
          {d.characters.length > 0 && (
            <ShowMore initial={CAST_SHOWN} label="Show more cast" className="td-char-grid">
              {d.characters.map((c) => <CharacterCard c={c} key={c.id} />)}
            </ShowMore>
          )}
        </Section>
        <Section title="Staff" kanji="スタッフ" accent="violet">
          {staff.length > 0 && (
            <ShowMore initial={STAFF_SHOWN} label="Show full staff" className="td-staff-grid">
              {staff.map((s) => <StaffRow s={s} key={`${s.id}-${s.role}`} />)}
            </ShowMore>
          )}
        </Section>
        <Relations d={d} />
        {d.entryType === "anime" && <Trailer d={d} />}
        <ExternalLinks d={d} />
        <Section title="You May Also Like" kanji="おすすめ" accent="crimson">
          {d.recommendations.length > 0 && <div className="td-similar-row"><RecRow items={d.recommendations} accent="crimson" ranked={false} /></div>}
        </Section>
      </div>
    </IndexProvider>
  );
}

function TitleSkeleton() {
  return (
    <div aria-busy="true">
      <div className="td-hero">
        <div className="td-hero-inner">
          <div className="td-cover td-img-empty" aria-hidden="true" />
          <div className="td-title-block"><div className="td-title td-faint">Loading…</div></div>
        </div>
      </div>
      <div className="td-body">
        <div className="td-actions td-actions-loading" aria-hidden="true" />
        <div className="td-stats-strip" aria-hidden="true">
          {Array.from({ length: 6 }, (_, i) => <div className="td-stat td-stat-skeleton" key={i} />)}
        </div>
      </div>
    </div>
  );
}

export default function TitleDetail({ type, params }: { type: EntryType; params: Params }) {
  return (
    <section className="site-page active td-page" data-type={type}>
      <Suspense fallback={<TitleSkeleton />}>
        <TitleContent type={type} params={params} />
      </Suspense>
    </section>
  );
}

/* ---------- Metadata ---------- */

export async function titleMetadata(type: EntryType, params: Params) {
  const { id } = await params;
  const anilistId = parseTitleId(id);
  const result = anilistId ? await lookup(type, id) : null;
  if (!result || result === "error" || result.status !== "ok") return { title: "OtakuVault" };

  const d = result.details;
  const title = `${d.english ?? d.romaji} — OtakuVault`;
  const description = descriptionParagraphs(d.description).join(" ").slice(0, 155);
  const image = d.banner ?? d.cover;
  return {
    title,
    description,
    openGraph: { title, description, images: image ? [image] : undefined },
    twitter: { card: "summary_large_image" as const, title, description, images: image ? [image] : undefined },
  };
}
