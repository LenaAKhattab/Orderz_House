import { TOKEN_KEY } from "./api";

function buildStreamUrl() {
  const base = (import.meta.env.VITE_API_BASE_URL || "http://localhost:5000/api").replace(/\/$/, "");
  const token = typeof localStorage !== "undefined" ? localStorage.getItem(TOKEN_KEY) : null;
  const qs = token && token.trim() ? `?token=${encodeURIComponent(token.trim())}` : "";
  return `${base}/notifications/stream${qs}`;
}

/**
 * Connect to SSE notification stream. Returns cleanup function.
 * @param {{ onNotification?: (payload: object) => void, onConnected?: () => void, onError?: () => void }} handlers
 */
export function connectNotificationStream(handlers = {}) {
  if (typeof EventSource === "undefined") return () => {};

  let closed = false;
  let es;

  try {
    es = new EventSource(buildStreamUrl(), { withCredentials: true });
  } catch {
    handlers.onError?.();
    return () => {};
  }

  es.addEventListener("connected", () => {
    handlers.onConnected?.();
  });

  es.addEventListener("notification", (ev) => {
    try {
      const payload = JSON.parse(ev.data || "{}");
      handlers.onNotification?.(payload);
    } catch {
      /* ignore malformed */
    }
  });

  es.onerror = () => {
    if (!closed) handlers.onError?.();
  };

  return () => {
    closed = true;
    try {
      es.close();
    } catch {
      /* ignore */
    }
  };
}
