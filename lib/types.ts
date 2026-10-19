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
};
