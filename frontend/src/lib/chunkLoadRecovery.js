/**
 * Recover from Vite/React.lazy chunk load failures (stale cache, corrupt disk cache,
 * or missing hashed assets after a deploy) so users are not stuck on a blank page.
 */

export const CHUNK_RELOAD_SESSION_KEY = "oh_chunk_reload_once";

const CHUNK_ERROR_PATTERNS = [
  /Failed to fetch dynamically imported module/i,
  /Importing a module script failed/i,
  /error loading dynamically imported module/i,
  /ChunkLoadError/i,
  /Loading chunk [\w.-]+ failed/i,
];

/**
 * @param {unknown} error
 * @returns {boolean}
 */
export function isChunkLoadError(error) {
  if (error == null) return false;
  const message =
    typeof error === "string"
      ? error
      : typeof error?.message === "string"
        ? error.message
        : typeof error?.name === "string"
          ? error.name
          : String(error);
  if (CHUNK_ERROR_PATTERNS.some((re) => re.test(message))) return true;
  if (typeof error?.name === "string" && /ChunkLoadError/i.test(error.name)) return true;
  return false;
}

/**
 * @returns {boolean} true if a reload was already attempted this tab session
 */
export function hasChunkReloadBeenAttempted() {
  try {
    return sessionStorage.getItem(CHUNK_RELOAD_SESSION_KEY) === "1";
  } catch {
    return false;
  }
}

export function markChunkReloadAttempted() {
  try {
    sessionStorage.setItem(CHUNK_RELOAD_SESSION_KEY, "1");
  } catch {
    /* ignore quota / private mode */
  }
}

export function clearChunkReloadFlag() {
  try {
    sessionStorage.removeItem(CHUNK_RELOAD_SESSION_KEY);
  } catch {
    /* ignore */
  }
}

/**
 * Minimal Arabic fallback when auto-reload already ran once.
 * @param {ParentNode | null | undefined} root
 */
export function showChunkLoadFallback(root = typeof document !== "undefined" ? document.getElementById("root") : null) {
  if (!root || typeof document === "undefined") return;

  root.innerHTML = "";
  const wrap = document.createElement("div");
  wrap.setAttribute("dir", "rtl");
  wrap.setAttribute("lang", "ar");
  wrap.setAttribute("role", "alert");
  wrap.style.cssText =
    "min-height:100vh;display:flex;align-items:center;justify-content:center;padding:24px;font-family:Cairo,Tahoma,sans-serif;background:#f8fafc;color:#0f172a;text-align:center;";

  const box = document.createElement("div");
  box.style.cssText = "max-width:28rem;";

  const msg = document.createElement("p");
  msg.textContent = "حدث تحديث في ملفات الموقع. يرجى تحديث الصفحة.";
  msg.style.cssText = "margin:0 0 1.25rem;font-size:1.125rem;line-height:1.7;font-weight:600;";

  const btn = document.createElement("button");
  btn.type = "button";
  btn.textContent = "تحديث الصفحة";
  btn.style.cssText =
    "appearance:none;border:0;border-radius:10px;padding:0.75rem 1.5rem;font:inherit;font-weight:700;cursor:pointer;background:#0f766e;color:#fff;";
  btn.addEventListener("click", () => {
    clearChunkReloadFlag();
    window.location.reload();
  });

  box.appendChild(msg);
  box.appendChild(btn);
  wrap.appendChild(box);
  root.appendChild(wrap);
}

/**
 * @returns {"reloading" | "fallback" | "noop"}
 */
export function recoverFromChunkLoadFailure() {
  const win = typeof window !== "undefined" ? window : typeof globalThis !== "undefined" ? globalThis : null;
  if (!win?.location?.reload) return "noop";

  if (!hasChunkReloadBeenAttempted()) {
    markChunkReloadAttempted();
    win.location.reload();
    return "reloading";
  }

  showChunkLoadFallback(
    typeof document !== "undefined" ? document.getElementById("root") : null
  );
  return "fallback";
}

/**
 * Install global listeners. Safe to call once at app boot.
 * @returns {() => void} uninstall
 */
export function installChunkLoadRecovery() {
  if (typeof window === "undefined") return () => {};

  const onRejection = (event) => {
    if (!isChunkLoadError(event?.reason)) return;
    event.preventDefault?.();
    recoverFromChunkLoadFailure();
  };

  const onError = (event) => {
    const candidate = event?.error ?? event?.message;
    if (!isChunkLoadError(candidate)) return;
    event.preventDefault?.();
    recoverFromChunkLoadFailure();
  };

  window.addEventListener("unhandledrejection", onRejection);
  window.addEventListener("error", onError);

  return () => {
    window.removeEventListener("unhandledrejection", onRejection);
    window.removeEventListener("error", onError);
  };
}
