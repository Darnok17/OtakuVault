import type { Entry } from "./types";

// Tells the rest of a title page (the title world's list marks and franchise progress) that the
// list actions just saved this title's entry, so it updates without a reload. A same-tab DOM
// event: it carries only the signed-in user's own entry and never leaves their browser.
export const ENTRY_SAVED = "ov:entry-saved";
export type EntrySaved = { anilistId: number; entry: Entry };

export function announceEntry(anilistId: number, entry: Entry) {
  window.dispatchEvent(new CustomEvent<EntrySaved>(ENTRY_SAVED, { detail: { anilistId, entry } }));
}
