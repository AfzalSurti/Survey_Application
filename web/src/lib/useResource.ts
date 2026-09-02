import { useCallback, useEffect, useRef, useState } from "react";

/**
 * Small stale-while-revalidate cache so moving between pages (Dashboard <-> Records)
 * paints instantly from memory instead of re-loading from scratch every time,
 * while still picking up new data in the background.
 *
 * - First mount with a warm cache: shows cached data immediately, no spinner.
 * - Revalidates on mount when the cache is older than `staleMs`.
 * - `pollMs` keeps the view fresh while it stays open (mobile syncs show up on their own).
 * - Also revalidates when the tab regains focus.
 */

type Entry = { data: unknown; ts: number; inflight?: Promise<unknown> };
const store = new Map<string, Entry>();

export function mutateResource<T>(key: string, data: T): void {
  store.set(key, { data, ts: Date.now() });
}

export function invalidateResource(key: string): void {
  store.delete(key);
}

export function useResource<T>(
  key: string,
  fetcher: () => Promise<T>,
  opts: { staleMs?: number; pollMs?: number } = {},
) {
  const { staleMs = 15_000, pollMs } = opts;
  const cached = store.get(key);
  const [data, setData] = useState<T | undefined>(cached?.data as T | undefined);
  const [loading, setLoading] = useState<boolean>(!cached);
  const [error, setError] = useState<string | null>(null);
  const fetcherRef = useRef(fetcher);
  fetcherRef.current = fetcher;

  const load = useCallback(
    async (silent: boolean) => {
      const existing = store.get(key);
      if (existing?.inflight) {
        try {
          setData((await existing.inflight) as T);
          setError(null);
        } catch {
          /* handled by the original caller */
        }
        return;
      }
      if (!silent && !store.get(key)) setLoading(true);
      const p = fetcherRef.current();
      store.set(key, { data: existing?.data, ts: existing?.ts ?? 0, inflight: p });
      try {
        const result = await p;
        store.set(key, { data: result, ts: Date.now() });
        setData(result);
        setError(null);
      } catch (e) {
        store.set(key, { data: existing?.data, ts: existing?.ts ?? 0 });
        setError((e as Error).message || "Could not load data.");
      } finally {
        setLoading(false);
      }
    },
    [key],
  );

  useEffect(() => {
    const entry = store.get(key);
    if (entry) setData(entry.data as T);
    const fresh = entry && Date.now() - entry.ts < staleMs;
    if (!fresh) void load(Boolean(entry));
    else setLoading(false);

    const onFocus = () => void load(true);
    window.addEventListener("focus", onFocus);
    const iv = pollMs ? window.setInterval(() => void load(true), pollMs) : undefined;
    return () => {
      window.removeEventListener("focus", onFocus);
      if (iv) window.clearInterval(iv);
    };
  }, [key, staleMs, pollMs, load]);

  return { data, loading, error, refresh: () => load(true) };
}
