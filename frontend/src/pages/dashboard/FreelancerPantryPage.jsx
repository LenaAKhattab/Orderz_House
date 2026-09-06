import { Navigate } from "react-router-dom";

/**
 * Open pantry requests now appear in «الطلبات المتاحة» with the same pool row UI.
 * Keep this route as a redirect so old bookmarks/links still work.
 */
export default function FreelancerPantryPage() {
  return <Navigate to="/dashboard/freelancer/orders" replace />;
}
