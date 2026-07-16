import { PRODUCTION_API_URL } from "@/api/client";

/** Ping Render until the API wakes (cold start can take ~30–60s). */
export async function wakeServer(options?: {
  maxMs?: number;
  onSlow?: () => void;
}): Promise<boolean> {
  const maxMs = options?.maxMs ?? 90_000;
  const started = Date.now();
  let slowFired = false;

  while (Date.now() - started < maxMs) {
    if (!slowFired && Date.now() - started > 900) {
      slowFired = true;
      options?.onSlow?.();
    }
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 12_000);
      const res = await fetch(`${PRODUCTION_API_URL}/api/health`, {
        signal: controller.signal,
      });
      clearTimeout(timer);
      if (res.ok) return true;
    } catch {
      /* retry while Render boots */
    }
    await new Promise((r) => setTimeout(r, 2000));
  }
  return false;
}
