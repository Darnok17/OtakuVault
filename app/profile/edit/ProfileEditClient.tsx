"use client";

import { useRef, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { DndContext, KeyboardSensor, PointerSensor, closestCenter, useSensor, useSensors, type DragEndEvent } from "@dnd-kit/core";
import { SortableContext, arrayMove, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import Avatar from "@/app/_components/Avatar";
import { removePin, reorderPins } from "@/app/actions/pins";
import { changeUsername, saveProfile, setAvatar } from "@/app/actions/profile";
import { authClient } from "@/lib/auth-client";
import { uploadImageFile } from "@/lib/image";
import { Markdown } from "@/lib/markdown";
import type { ResolvedPin } from "@/lib/profile";
import type { PublicFields } from "@/lib/types";
import { USERNAME_CHANGE_DAYS, USERNAME_MAX, slugifyUsername, usernameProblem } from "@/lib/username";

const BIO_MAX = 1000;
const PRONOUNS_MAX = 50;

type Profile = {
  username: string; displayName: string; bio: string; pronouns: string; avatar: string | null; hasUpload: boolean;
  isProfilePublic: boolean; publicFields: PublicFields; usernameLockedUntil: string | null;
};
type EditPin = Omit<ResolvedPin, "board"> & { nodes: number | null };
type Note = { ok: boolean; text: string } | null;

const FIELDS: [keyof PublicFields, string, string][] = [
  ["bio", "Bio", "The text under your name"],
  ["pronouns", "Pronouns", "Shown next to your username"],
  ["collection", "Collection", "The Collection tab, plus “Currently Engaging With” and “Favorites”"],
  ["moodboards", "Moodboards", "The Moodboards tab and pinned boards"],
  ["forumPosts", "Forum posts", "The Forum tab. Your posts in the forum itself always show your name"],
];
const KIND_LABEL: Record<ResolvedPin["kind"], string> = { entry: "Collection", moodboard: "Moodboard", forum_thread: "Thread", product: "Store" };
const DATE = new Intl.DateTimeFormat("en-US", { dateStyle: "long", timeZone: "UTC" });

function Message({ note }: { note: Note }) {
  if (!note) return null;
  return <div className={note.ok ? "ov-ok" : "ov-error"} role={note.ok ? "status" : "alert"}>{note.text}</div>;
}

function PinRow({ pin, onRemove, busy }: { pin: EditPin; onRemove: (id: string) => void; busy: boolean }) {
  const { attributes, listeners, setNodeRef, setActivatorNodeRef, transform, transition, isDragging } = useSortable({ id: pin.id });
  return (
    <li ref={setNodeRef} className={`pe-pin${isDragging ? " dragging" : ""}`} style={{ transform: CSS.Translate.toString(transform), transition }}>
      <button type="button" className="pe-pin-handle" ref={setActivatorNodeRef} {...attributes} {...listeners} aria-label={`Reorder ${pin.title}`}>
        <svg width="12" height="16" viewBox="0 0 12 16" fill="currentColor" aria-hidden="true"><circle cx="3" cy="3" r="1.5" /><circle cx="9" cy="3" r="1.5" /><circle cx="3" cy="8" r="1.5" /><circle cx="9" cy="8" r="1.5" /><circle cx="3" cy="13" r="1.5" /><circle cx="9" cy="13" r="1.5" /></svg>
      </button>
      <span className="pe-pin-thumb" style={pin.image ? { backgroundImage: `url(${JSON.stringify(pin.image)})` } : undefined} aria-hidden="true">{pin.image ? "" : pin.glyph}</span>
      <span className="pe-pin-text">
        <span className="pe-pin-title">{pin.title}</span>
        <span className="ov-hint">{KIND_LABEL[pin.kind]} · {pin.sub.split(" · ").slice(1).join(" · ") || pin.sub}</span>
      </span>
      <button type="button" className="btn btn-ghost pe-pin-remove" disabled={busy} onClick={() => onRemove(pin.id)} aria-label={`Unpin ${pin.title}`}>Unpin</button>
    </li>
  );
}

export default function ProfileEditClient({ profile, pins: initialPins }: { profile: Profile; pins: EditPin[] }) {
  const router = useRouter();
  const { refetch } = authClient.useSession();

  /* Picture */
  const fileRef = useRef<HTMLInputElement>(null);
  const [avatar, setAvatarUrl] = useState(profile.avatar);
  const [hasUpload, setHasUpload] = useState(profile.hasUpload);
  const [avatarBusy, setAvatarBusy] = useState<string | null>(null);
  const [avatarNote, setAvatarNote] = useState<Note>(null);

  const pickAvatar = async (file: File | undefined) => {
    if (!file) return;
    setAvatarNote(null);
    try {
      const url = await uploadImageFile(file, "avatar", (s) => setAvatarBusy(s === "preparing" ? "Preparing…" : "Uploading…"));
      const res = await setAvatar(url);
      if (!res.ok) throw new Error(res.error);
      setAvatarUrl(res.avatar); setHasUpload(true);
      setAvatarNote({ ok: true, text: "Picture updated." });
      void refetch();
    } catch (err) {
      setAvatarNote({ ok: false, text: (err as Error).message || "Upload failed. Try again." });
    } finally {
      setAvatarBusy(null);
      if (fileRef.current) fileRef.current.value = "";
    }
  };
  const clearAvatar = async () => {
    setAvatarBusy("Removing…"); setAvatarNote(null);
    const res = await setAvatar(null).catch(() => ({ ok: false as const, error: "Couldn't remove the picture. Try again." }));
    setAvatarBusy(null);
    if (!res.ok) return setAvatarNote({ ok: false, text: res.error });
    setAvatarUrl(res.avatar); setHasUpload(false);
    setAvatarNote({ ok: true, text: "Picture removed." });
    void refetch();
  };

  /* Details + visibility (one Save) */
  const [displayName, setDisplayName] = useState(profile.displayName);
  const [pronouns, setPronouns] = useState(profile.pronouns);
  const [bio, setBio] = useState(profile.bio);
  const [preview, setPreview] = useState(false);
  const [isPublic, setIsPublic] = useState(profile.isProfilePublic);
  const [fields, setFields] = useState(profile.publicFields);
  const [saving, startSave] = useTransition();
  const [saveNote, setSaveNote] = useState<Note>(null);

  const save = (e: React.FormEvent) => {
    e.preventDefault();
    setSaveNote(null);
    startSave(async () => {
      const res = await saveProfile({ displayName, bio, pronouns, isProfilePublic: isPublic, publicFields: fields })
        .catch(() => ({ ok: false as const, error: "Couldn't save. Check your connection and try again." }));
      setSaveNote(res.ok ? { ok: true, text: "Profile saved." } : { ok: false, text: res.error });
      if (res.ok) { void refetch(); router.refresh(); }
    });
  };

  /* Username */
  const [username, setUsername] = useState(profile.username);
  const [current, setCurrent] = useState(profile.username);
  const [lockedUntil, setLockedUntil] = useState(profile.usernameLockedUntil);
  const [nameBusy, setNameBusy] = useState(false);
  const [nameNote, setNameNote] = useState<Note>(null);
  const saveUsername = async (e: React.FormEvent) => {
    e.preventDefault();
    const problem = usernameProblem(username);
    if (problem) return setNameNote({ ok: false, text: `${problem}.` });
    setNameBusy(true); setNameNote(null);
    const res = await changeUsername(username).catch(() => ({ ok: false as const, error: "Couldn't change the username. Try again." }));
    setNameBusy(false);
    if (!res.ok) return setNameNote({ ok: false, text: res.error });
    setCurrent(res.username); setUsername(res.username);
    setLockedUntil(new Date(Date.now() + USERNAME_CHANGE_DAYS * 86_400_000).toISOString());
    setNameNote({ ok: true, text: `You are now @${res.username}. Your old profile link no longer works.` });
    void refetch();
  };

  /* Pins */
  const [pins, setPins] = useState(initialPins);
  const [pinBusy, setPinBusy] = useState(false);
  const [pinNote, setPinNote] = useState<Note>(null);
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );
  const onDragEnd = async ({ active, over }: DragEndEvent) => {
    if (!over || active.id === over.id) return;
    const before = pins;
    const next = arrayMove(pins, pins.findIndex((p) => p.id === active.id), pins.findIndex((p) => p.id === over.id));
    setPins(next); setPinNote(null);
    try { await reorderPins(next.map((p) => p.id)); }
    catch { setPins(before); setPinNote({ ok: false, text: "Couldn't save the new order. Try again." }); }
  };
  const unpin = async (id: string) => {
    const before = pins;
    setPinBusy(true); setPinNote(null);
    setPins(pins.filter((p) => p.id !== id));
    try { await removePin(id); }
    catch { setPins(before); setPinNote({ ok: false, text: "Couldn't unpin that. Try again." }); }
    setPinBusy(false);
  };

  return (
    <div className="ov-stack pe">
      <section className="ov-panel">
        <h2 className="ov-title">Picture</h2>
        <div className="pe-avatar">
          <Avatar src={avatar} name={displayName || current} size="xl" />
          <div className="ov-stack" style={{ gap: ".6rem" }}>
            <div className="ov-row">
              <button type="button" className="btn btn-primary" disabled={!!avatarBusy} onClick={() => fileRef.current?.click()}>{avatarBusy ?? (hasUpload ? "Replace picture" : "Upload picture")}</button>
              {hasUpload && <button type="button" className="btn btn-ghost" disabled={!!avatarBusy} onClick={clearAvatar}>Remove</button>}
            </div>
            <p className="ov-hint">JPEG, PNG, WebP, GIF or AVIF. It is shown as a circle, so centre the subject.</p>
            <input ref={fileRef} type="file" accept="image/jpeg,image/png,image/webp,image/gif,image/avif" hidden onChange={(e) => pickAvatar(e.target.files?.[0])} />
          </div>
        </div>
        <Message note={avatarNote} />
      </section>

      <form className="ov-stack" onSubmit={save}>
        <section className="ov-panel">
          <h2 className="ov-title">About you</h2>
          <div className="pe-two">
            <div className="ov-field">
              <label className="ov-label" htmlFor="pe-name">Display name</label>
              <input id="pe-name" className="ov-input" value={displayName} maxLength={60} required onChange={(e) => setDisplayName(e.target.value)} />
            </div>
            <div className="ov-field">
              <label className="ov-label" htmlFor="pe-pronouns">Pronouns</label>
              <input id="pe-pronouns" className="ov-input" value={pronouns} maxLength={PRONOUNS_MAX} placeholder="she/her, they/them…" onChange={(e) => setPronouns(e.target.value)} />
            </div>
          </div>
          <div className="ov-field" style={{ marginBottom: 0 }}>
            <div className="ov-row between">
              <label className="ov-label" htmlFor="pe-bio">Bio</label>
              <button type="button" className="ov-link pe-preview-toggle" aria-pressed={preview} onClick={() => setPreview(!preview)}>{preview ? "Keep writing" : "Preview"}</button>
            </div>
            {preview
              ? <div className="ov-input pe-bio-preview">{bio.trim() ? <Markdown text={bio} /> : <span className="ov-hint">Nothing to preview yet.</span>}</div>
              : <textarea id="pe-bio" className="ov-input" value={bio} maxLength={BIO_MAX} rows={6} placeholder="What are you watching? What would you defend to the death?" onChange={(e) => setBio(e.target.value)} />}
            <div className="ov-row between">
              <span className="ov-hint">Markdown works: **bold**, *italic*, [links](https://…), `code`, &gt; quotes.</span>
              <span className={`ov-hint${bio.length > BIO_MAX - 50 ? " pe-near-limit" : ""}`}>{bio.length}/{BIO_MAX}</span>
            </div>
          </div>
        </section>

        <section className="ov-panel">
          <h2 className="ov-title">Who can see your profile</h2>
          <label className="ov-toggle" style={{ marginTop: ".9rem" }}>
            <input type="checkbox" checked={isPublic} onChange={(e) => setIsPublic(e.target.checked)} />
            <span className="ov-toggle-track" />
            <span className="ov-toggle-text">
              <span className="ov-toggle-title">Public profile</span>
              <span className="ov-toggle-desc">{isPublic ? "Anyone with the link can open your profile." : "Only you can open your profile. Visitors see “This profile is private”."}</span>
            </span>
          </label>
          <hr className="set-divider" />
          <fieldset className="pe-fields" disabled={!isPublic}>
            <legend className="ov-label">Sections visitors can see</legend>
            {FIELDS.map(([key, label, desc]) => (
              <label className="ov-check" key={key}>
                <input type="checkbox" checked={fields[key]} onChange={(e) => setFields({ ...fields, [key]: e.target.checked })} />
                <span><strong>{label}</strong><span className="ov-hint pe-field-desc">{desc}</span></span>
              </label>
            ))}
          </fieldset>
        </section>

        <div className="ov-row pe-save">
          <button type="submit" className="btn btn-primary" disabled={saving}>{saving ? "Saving…" : "Save profile"}</button>
          <Link className="btn btn-ghost" href={`/profile/${current}`}>View profile</Link>
          <Message note={saveNote} />
        </div>
      </form>

      <section className="ov-panel">
        <h2 className="ov-title">Username</h2>
        <form onSubmit={saveUsername}>
          <div className="ov-field">
            <label className="ov-label" htmlFor="pe-username">Your profile lives at /profile/{username || "…"}</label>
            <div className="ov-row pe-username">
              <span className="pe-at" aria-hidden="true">@</span>
              <input id="pe-username" className="ov-input" value={username} maxLength={USERNAME_MAX} autoCapitalize="none" spellCheck={false} disabled={!!lockedUntil}
                onChange={(e) => setUsername(slugifyUsername(e.target.value))} />
              <button type="submit" className="btn btn-ghost" disabled={nameBusy || !!lockedUntil || username === current}>{nameBusy ? "Checking…" : "Change"}</button>
            </div>
            <p className="ov-hint">
              {lockedUntil
                ? `You changed your username recently. You can change it again on ${DATE.format(new Date(lockedUntil))}.`
                : `3–${USERNAME_MAX} lowercase letters, numbers or underscores. You can change it once every ${USERNAME_CHANGE_DAYS} days, and the old link stops working.`}
            </p>
          </div>
          <Message note={nameNote} />
        </form>
      </section>

      <section className="ov-panel">
        <div className="ov-row between">
          <h2 className="ov-title">Pinned</h2>
          <span className="ov-meta">{pins.length} pinned</span>
        </div>
        {pins.length ? (
          <>
            <p className="ov-sub" style={{ margin: ".3rem 0 1rem" }}>Drag to set the order they appear in on your profile.</p>
            <DndContext id="profile-pins" sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
              <SortableContext items={pins.map((p) => p.id)} strategy={verticalListSortingStrategy}>
                <ul className="pe-pins">{pins.map((p) => <PinRow key={p.id} pin={p} onRemove={unpin} busy={pinBusy} />)}</ul>
              </SortableContext>
            </DndContext>
          </>
        ) : (
          <p className="ov-sub" style={{ marginTop: ".5rem" }}>Nothing pinned yet. Use the pin button on a collection card, a moodboard, a forum thread or a store product.</p>
        )}
        <Message note={pinNote} />
      </section>
    </div>
  );
}
