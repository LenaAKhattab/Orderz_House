import { Suspense } from "react";
import { Outlet } from "react-router-dom";
import RouteSuspenseFallback from "../ui/RouteSuspenseFallback";

/** Wraps nested routes so React.lazy page chunks show a consistent fallback. */
export default function LazyRouteOutlet() {
  return (
    <Suspense fallback={<RouteSuspenseFallback />}>
      <Outlet />
    </Suspense>
  );
}
