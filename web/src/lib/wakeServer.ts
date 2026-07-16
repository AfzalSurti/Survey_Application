/** Ping Render until the API wakes (cold start can take ~30–60s). */

const API_BASE = (import.meta.env.VITE_API_URL as string | undefined)?.replace(/\/$/, "") || "";

export async function wakeServer(options?: {
  maxMs?: number;
  onSlow?: () => void;
  signal?: AbortSignal;
}): Promise<boolean> {
  const maxMs = options?.maxMs ?? 90_000;
  const started = Date.now();
  let slowFired = false;

  while (Date.now() - started < maxMs) {
    if (options?.signal?.aborted) return false;
    if (!slowFired && Date.now() - started > 900) {
      slowFired = true;
      options?.onSlow?.();
    }
    try {
      const controller = new AbortController();
      const timer = window.setTimeout(() => controller.abort(), 12_000);
      const res = await fetch(`${API_BASE}/api/health`, {
        signal: options?.signal ?? controller.signal,
        cache: "no-store",
      });
      window.clearTimeout(timer);
      if (res.ok) return true;
    } catch {
      /* retry while Render boots */
    }
    await new Promise((r) => setTimeout(r, 2000));
  }
  return false;
}
