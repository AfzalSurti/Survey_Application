import { useEffect, useState, type ReactNode } from "react";
import { ServerWakeScreen } from "./ServerWakeScreen";
import { apiBaseUrl, wakeServer } from "../lib/wakeServer";

/**
 * Blocks the entire app (including landing) until the Render API is healthy.
 * Nothing else mounts until then — avoids blank/error screens on cold start.
 */
export function ServerGate({ children }: { children: ReactNode }) {
  const [phase, setPhase] = useState<"waking" | "ready" | "failed">("waking");
  const [attempt, setAttempt] = useState(0);
  const [retryKey, setRetryKey] = useState(0);

  useEffect(() => {
    const ac = new AbortController();
    let cancelled = false;
    setPhase("waking");
    (async () => {
      const ok = await wakeServer({
        signal: ac.signal,
        onAttempt: (n) => {
          if (!cancelled) setAttempt(n);
        },
      });
      if (cancelled) return;
      setPhase(ok ? "ready" : "failed");
    })();
    return () => {
      cancelled = true;
      ac.abort();
    };
  }, [retryKey]);

  if (phase === "ready") return <>{children}</>;

  if (phase === "failed") {
    return (
      <ServerWakeScreen
        detail={`Could not reach the server at ${apiBaseUrl()}. It may still be starting — tap Retry.`}
        statusLabel="Unavailable"
        actionLabel="Retry connection"
        onAction={() => {
          setAttempt(0);
          setRetryKey((k) => k + 1);
        }}
      />
    );
  }

  return (
    <ServerWakeScreen
      detail={`Waking up server — please wait. Nothing opens until the API is ready (attempt ${Math.max(attempt, 1)})…`}
      statusLabel="Connecting"
    />
  );
}
