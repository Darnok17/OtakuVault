export type EntryType = "anime" | "manga" | "webtoon" | "novel";
export type EntryStatus = "completed" | "watching" | "on-hold" | "plan-to" | "dropped";

export type Entry = {
  id: string;
  title: string;
  type: EntryType;
  status: EntryStatus;
  genre: string;
  totalEps: string;
  notes: string;
  rating: number;
  imageUrl: string;
  progressCurrent: number;
  progressTotal: number;
  created: number;
  // Position within its rating tier (same type + rating); unset entries sort first, newest first.
  manualOrder?: number;
  // Set when the entry came from AniList; links it to its detail page.
  anilistId?: number;
};

export type MoodNodeType =
  | "note" | "image" | "quote" | "link"
  | "character" | "episode" | "bubble" | "custom";

export type MoodNode = {
  id: string;
  type: MoodNodeType;
  // Canvas-space position of the node's top-left corner (origin = board center).
  x: number;
  y: number;
  // Per-type text fields (and image data URLs), keyed by field name.
  data: Record<string, string>;
};

export type MoodWire = {
  id: string;
  from: string;
  to: string;
};

export type Moodboard = {
  nodes: MoodNode[];
  wires: MoodWire[];
};

/* ---------- Profiles ---------- */

// Which parts of a public profile visitors may see. The owner always sees everything.
export type PublicFields = {
  bio: boolean;
  pronouns: boolean;
  collection: boolean;
  moodboards: boolean;
  forumPosts: boolean;
};

export const DEFAULT_PUBLIC_FIELDS: PublicFields = { bio: true, pronouns: true, collection: true, moodboards: true, forumPosts: true };

// Stored sparsely (users.public_fields): a missing key means the section is visible.
export const publicFieldsOf = (stored: Partial<PublicFields> | null | undefined): PublicFields =>
  ({ ...DEFAULT_PUBLIC_FIELDS, ...stored });

export type PinKind = "entry" | "moodboard" | "forum_thread" | "product";
