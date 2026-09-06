import { getApiBaseUrl } from "../config/apiBase";

function buildStreamUrl() {
  return `${getApiBaseUrl()}/notifications/stream`;
}

/**
 * Connect to SSE notification stream. Returns cleanup function.
 * Auth: HttpOnly session cookie via withCredentials (no JWT in query string).
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
