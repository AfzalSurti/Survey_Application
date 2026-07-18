/** Production Render API — used when VITE_API_URL is missing at build time. */
export const PRODUCTION_API_URL = "https://survey-application-4r6q.onrender.com";

export function apiBaseUrl(): string {
  const fromEnv = (import.meta.env.VITE_API_URL as string | undefined)?.replace(/\/$/, "").trim();
  return fromEnv || PRODUCTION_API_URL;
}

/** Ping Render until /api/health succeeds. Does not open the app on failure. */
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
