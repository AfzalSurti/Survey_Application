/** Production Render API — used by mobile / direct calls; web prod uses Vercel proxy. */
export const PRODUCTION_API_URL = "https://survey-application-4r6q.onrender.com";

/**
 * Browser API base.
 * - Production web: same-origin "" so Vercel rewrites /api → Render (no CORS).
 * - Dev: VITE_API_URL or local backend.
 */
export function apiBaseUrl(): string {
  const fromEnv = (import.meta.env.VITE_API_URL as string | undefined)?.replace(/\/$/, "").trim();
  if (import.meta.env.PROD) {
    if (fromEnv && /localhost|127\.0\.0\.1/.test(fromEnv)) return fromEnv;
    return "";
  }
  return fromEnv || "http://localhost:8000";
}

/** Ping API until /api/health succeeds. Does not open the app on failure. */
export async function wakeServer(options?: {
  maxMs?: number;
  onAttempt?: (attempt: number) => void;
  signal?: AbortSignal;
}): Promise<boolean> {
  const maxMs = options?.maxMs ?? 120_000;
  const base = apiBaseUrl();
  const started = Date.now();
  let attempt = 0;

  while (Date.now() - started < maxMs) {
    if (options?.signal?.aborted) return false;
    attempt += 1;
    options?.onAttempt?.(attempt);
    try {
      const controller = new AbortController();
      const onAbort = () => controller.abort();
      options?.signal?.addEventListener("abort", onAbort);
      const timer = window.setTimeout(() => controller.abort(), 15_000);
      try {
        const res = await fetch(`${base}/api/health`, {
          signal: controller.signal,
          cache: "no-store",
        });
        if (res.ok) return true;
      } finally {
        window.clearTimeout(timer);
        options?.signal?.removeEventListener("abort", onAbort);
      }
    } catch {
      /* Render cold start / network — keep retrying */
    }
    await new Promise((r) => setTimeout(r, 2500));
  }
  return false;
}
