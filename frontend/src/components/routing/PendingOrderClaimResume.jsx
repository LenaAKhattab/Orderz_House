import { useEffect } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "../../context/useAuth";
import { readPendingOrderClaim } from "../../lib/orders/pendingOrderClaim";

/**
 * After a customer signs in / finishes registration in the same tab, resume a pending order claim.
 * Renders nothing; only acts for client accounts with a stored, well-formed token.
 */
export default function PendingOrderClaimResume() {
  const { user } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const role = user?.primaryRole || user?.role;

  useEffect(() => {
    if (role !== "client") return;
    if (location.pathname === "/claim-order") return;
    if (!location.pathname.startsWith("/dashboard")) return;
    if (readPendingOrderClaim()) navigate("/claim-order", { replace: true });
  }, [role, location.pathname, navigate]);

  return null;
}
