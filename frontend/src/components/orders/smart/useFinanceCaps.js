import { useMemo } from "react";
import { useAuth } from "../../../context/useAuth";
import { ADMIN_PAGE_PERMISSIONS, userHasPermission } from "../../../constants/dashboardPermissions";
import { financeCapabilities } from "./financeUtils";

/** Finance permission flags for the signed-in staff user (Super Admin always has all). UX only — backend enforces. */
export function useFinanceCaps() {
  const { user } = useAuth();
  return useMemo(() => financeCapabilities((k) => userHasPermission(user, k), ADMIN_PAGE_PERMISSIONS), [user]);
}
