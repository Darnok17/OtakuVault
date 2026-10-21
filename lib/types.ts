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
