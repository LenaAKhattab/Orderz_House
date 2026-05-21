import * as authTw from "../auth/authTw";

/** Full-screen session restore / route chunk loading — no dashboard CSS deps. */
export function AuthRouteSkeleton() {
  return (
    <div
      className={`${authTw.authRouteLoading} ${authTw.authRouteLoadingSkel}`}
      role="status"
      aria-live="polite"
      aria-busy="true"
      aria-label="جارٍ التحميل"
    >
      <div className={authTw.authRouteSkel}>
        <span
          className="oh-skel oh-skel-line"
          style={{ height: 22, width: 200, borderRadius: 8, margin: "0 auto 22px", display: "block" }}
          aria-hidden
        />
        <span
          className="oh-skel oh-skel-line"
          style={{ height: 13, width: "min(420px, 90vw)", margin: "0 auto 10px", display: "block" }}
          aria-hidden
        />
        <span
          className="oh-skel oh-skel-line"
          style={{ height: 13, width: "min(320px, 75vw)", margin: "0 auto", display: "block" }}
          aria-hidden
        />
      </div>
    </div>
  );
}
