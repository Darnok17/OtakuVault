// Per-key debounced saver. Rapid changes to one key collapse into a single save once
// `delay` ms pass without another change; at most one save per key is in flight, and a
// change made during a save triggers one more. Failed saves retry a few times.

export type SaveStatus = "pending" | "saving" | "saved" | "error";

type Options<K> = {
  delay: number;
  onStatus: (key: K, status: SaveStatus) => void;
  retryMs?: number;
  maxRetries?: number;
};

export function debounceSave<K>(save: (key: K) => Promise<void>, { delay, onStatus, retryMs = 4000, maxRetries = 3 }: Options<K>) {
  const timers = new Map<K, ReturnType<typeof setTimeout>>();
  const inflight = new Map<K, Promise<void>>();
  const dirty = new Set<K>();
  const failures = new Map<K, number>();

  const clearTimer = (key: K) => {
    clearTimeout(timers.get(key));
    timers.delete(key);
  };

  async function flush(key: K): Promise<void> {
    clearTimer(key);
    while (inflight.has(key)) await inflight.get(key);
    if (!dirty.has(key)) return;
    dirty.delete(key);
    onStatus(key, "saving");
    const run = save(key).then(
      () => {
        failures.delete(key);
        if (!dirty.has(key)) onStatus(key, "saved");
      },
      (err) => {
        console.error("Save failed:", err);
        const n = (failures.get(key) ?? 0) + 1;
        failures.set(key, n);
        dirty.add(key);
        onStatus(key, "error");
        // Keep the change dirty either way; after maxRetries the next edit (or flush) tries again.
        if (n <= maxRetries) timers.set(key, setTimeout(() => void flush(key), retryMs * n));
      }
    ).finally(() => inflight.delete(key));
    inflight.set(key, run);
    await run;
  }

  return {
    schedule(key: K) {
      dirty.add(key);
      failures.delete(key);
      clearTimer(key);
      onStatus(key, "pending");
      timers.set(key, setTimeout(() => void flush(key), delay));
    },
    flush,
    flushAll: () => Promise.all([...new Set([...dirty, ...timers.keys()])].map(flush)).then(() => {}),
    // Drop unsaved changes for a key (e.g. its entry was deleted).
    cancel(key: K) {
      clearTimer(key);
      dirty.delete(key);
      failures.delete(key);
    },
    hasPending: () => dirty.size > 0 || inflight.size > 0,
  };
}
