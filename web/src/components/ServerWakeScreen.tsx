export function ServerWakeScreen({
  detail,
  statusLabel = "Connecting",
  actionLabel,
  onAction,
}: {
  detail?: string;
  statusLabel?: string;
  actionLabel?: string;
  onAction?: () => void;
}) {
  return (
    <div className="wake-screen" role="status" aria-live="polite">
      <div className="wake-orb-wrap">
        <span className="wake-ring wake-ring-1" />
        <span className="wake-ring wake-ring-2" />
        <span className="wake-ring wake-ring-3" />
        <div className="wake-orb">
          <img src="/gdrpl-logo.png" alt="GDRPL" />
        </div>
      </div>
      <p className="wake-eyebrow">GDRPL Survey</p>
      <h1 className="wake-title">Geo Designs &amp; Research</h1>
      <p className="wake-msg">
        {detail || "Waking up server — this can take up to a minute on first load…"}
      </p>
      <div className="wake-connecting">
        <span className="wake-dot" />
        <span className="wake-dot" />
        <span className="wake-dot" />
        <span>{statusLabel}</span>
      </div>
      {actionLabel && onAction ? (
        <button className="button wake-retry" type="button" onClick={onAction}>
          {actionLabel}
        </button>
      ) : null}
    </div>
  );
}
