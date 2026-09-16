import { PRODUCTION_API_URL } from "@/api/client";

/**
 * A single health-check attempt with a HARD deadline.
 *
 * On flaky/weak mobile signal, a stalled connection attempt is not reliably
 * cancelled by AbortController on Android — fetch() can keep the caller
 * waiting far past the abort timer (minutes, not seconds), because the abort
 * only asks the underlying request to stop; it doesn't force our `await` to
 * return. This wrapper resolves on its own timer regardless of what the real
 * fetch ends up doing, so a stuck attempt can never hold the caller hostage —
 * any late result from the abandoned fetch is simply ignored.
 */
function checkHealthOnce(timeoutMs: number): Promise<boolean> {
  return new Promise((resolve) => {
    let settled = false;
    const finish = (ok: boolean) => {
      if (settled) return;
      settled = true;
      resolve(ok);
    };

    const controller = new AbortController();
    const timer = setTimeout(() => {
      controller.abort();
      finish(false);
    }, timeoutMs);

    fetch(`${PRODUCTION_API_URL}/api/health`, { signal: controller.signal })
      .then((res) => {
        clearTimeout(timer);
        finish(res.ok);
      })
      .catch(() => {
        clearTimeout(timer);
        finish(false);
      });
  });
}

/**
 * Ping Render until the API wakes (cold start can take ~30-60s). `maxMs` is a
 * true hard cap on total wait time — every attempt is bounded by
 * checkHealthOnce(), so this always returns within roughly maxMs + one
 * attempt window, even on a connection that never properly times out itself.
 */
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
    const ok = await checkHealthOnce(8_000);
    if (ok) return true;
    await new Promise((r) => setTimeout(r, 1_500));
  }
  return false;
}
