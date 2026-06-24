import { Navigate } from "react-router-dom";

/** @deprecated Standalone rounds tab merged into Status & rounds — kept for lazy-route compatibility. */
export default function TrainingOrderRoundsPage() {
  return <Navigate to="/dashboard/super-admin/training-orders#round-history" replace />;
}
