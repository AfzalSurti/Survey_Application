import { useEffect, useState, type ReactNode } from "react";
import { ServerWakeScreen } from "./ServerWakeScreen";
import { wakeServer } from "../lib/wakeServer";

/**
 * On first visit (or after idle), Render may be cold.
 * Shows an animated GDRPL wake screen only when the health check is slow.
 */
export function ServerGate({ children }: { children: ReactNode }) {
  const [phase, setPhase] = useState<"checking" | "waking" | "ready">("checking");

  useEffect(() => {
    const ac = new AbortController();
    let cancelled = false;
    (async () => {
      const ok = await wakeServer({
        signal: ac.signal,
        onSlow: () => {
          if (!cancelled) setPhase("waking");
        },
      });
      if (!cancelled) setPhase(ok ? "ready" : "ready"); // still let UI through; login will explain errors
    })();
    return () => {
      cancelled = true;
      ac.abort();
    };
  }, []);

  if (phase === "waking" || phase === "checking") {
    // Show wake UI only once we know it's slow; brief check stays invisible
    if (phase === "checking") return <>{children}</>;
    return <ServerWakeScreen />;
  }
  return <>{children}</>;
}
