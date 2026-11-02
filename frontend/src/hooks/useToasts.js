import { useCallback, useRef, useState } from "react";

/** Minimal toast store: push returns an id so a pending toast can become a result. */
export function useToasts() {
  const [toasts, setToasts] = useState([]);
  const next = useRef(1);

  const dismiss = useCallback((id) => setToasts((t) => t.filter((x) => x.id !== id)), []);

  const push = useCallback(
    (toast) => {
      const id = next.current++;
      setToasts((t) => [...t, { id, ...toast }]);
      if (toast.kind !== "pending") setTimeout(() => dismiss(id), 6000);
      return id;
    },
    [dismiss]
  );

  const update = useCallback(
    (id, patch) => {
      setToasts((t) => t.map((x) => (x.id === id ? { ...x, ...patch } : x)));
      if (patch.kind && patch.kind !== "pending") setTimeout(() => dismiss(id), 6000);
    },
    [dismiss]
  );

  return { toasts, push, update, dismiss };
}
