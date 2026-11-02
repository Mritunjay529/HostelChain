export default function Toasts({ toasts, onDismiss }) {
  return (
    <div className="toasts" role="status" aria-live="polite">
      {toasts.map((t) => (
        <div key={t.id} className={`toast toast-${t.kind}`}>
          <span>{t.text}</span>
          {t.kind !== "pending" && (
            <button aria-label="Dismiss" onClick={() => onDismiss(t.id)}>×</button>
          )}
        </div>
      ))}
    </div>
  );
}
