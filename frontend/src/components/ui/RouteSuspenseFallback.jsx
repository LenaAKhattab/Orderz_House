import { AuthRouteSkeleton } from "./AuthRouteSkeleton";

/** Lightweight route chunk loading — same shell as auth restore, RTL-safe. */
export default function RouteSuspenseFallback() {
  return (
    <div className="route-suspense-fallback min-h-[40vh] w-full" role="status" aria-live="polite" aria-busy="true">
      <AuthRouteSkeleton />
    </div>
  );
}
