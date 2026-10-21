"use client";

import { useMemo, useRef } from "react";
import { EMPTY_BOARD, useEntriesStore } from "@/lib/store";
import type { MoodNode, MoodWire, Moodboard } from "@/lib/types";

const LIMIT = 50;

type NodePatches = Record<string, Partial<Omit<MoodNode, "id">>>;

// Board mutations with undo/redo. Each action snapshots the board first; the
// past stack keeps the last LIMIT snapshots. Typing into one field counts as a
// single action until a different field or action comes along.
export function useBoardHistory(entryId: string) {
  const h = useRef({ past: [] as Moodboard[], future: [] as Moodboard[], textKey: "" });

  return useMemo(() => {
    const store = useEntriesStore.getState;
    const board = () => store().moodboards[entryId] ?? EMPTY_BOARD;

    const record = (textKey = "") => {
      const hist = h.current;
      if (textKey && textKey === hist.textKey) return;
      hist.textKey = textKey;
      hist.past.push(board());
      if (hist.past.length > LIMIT) hist.past.shift();
      hist.future = [];
    };

    return {
      addNode: (node: MoodNode) => { record(); store().addNode(entryId, node); },
      deleteNodes: (ids: string[]) => { if (ids.length) { record(); store().deleteNodes(entryId, ids); } },
      patchNodes: (patches: NodePatches) => { record(); store().patchNodes(entryId, patches); },
      editField: (id: string, patch: Record<string, string>) => {
        record(`${id}:${Object.keys(patch).join(",")}`);
        store().updateNodeData(entryId, id, patch);
      },
      addWire: (wire: MoodWire) => { record(); store().addWire(entryId, wire); },
      deleteWires: (ids: string[]) => { if (ids.length) { record(); store().deleteWires(entryId, ids); } },
      // Nodes and wires removed together count as one step.
      deleteSelection: (nodeIds: string[], wireIds: string[]) => {
        if (!nodeIds.length && !wireIds.length) return;
        record();
        store().deleteWires(entryId, wireIds);
        store().deleteNodes(entryId, nodeIds);
      },
      undo: () => {
        const hist = h.current;
        const prev = hist.past.pop();
        if (!prev) return;
        hist.future.push(board());
        hist.textKey = "";
        store().setBoard(entryId, prev);
      },
      redo: () => {
        const hist = h.current;
        const next = hist.future.pop();
        if (!next) return;
        hist.past.push(board());
        hist.textKey = "";
        store().setBoard(entryId, next);
      },
    };
  }, [entryId]);
}

export type BoardActions = ReturnType<typeof useBoardHistory>;
