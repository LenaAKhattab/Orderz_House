import { Navigate, useSearchParams } from "react-router-dom";

/** Legacy route — redirects into الموحدة «المقالات». */
export default function SuperAdminMarketplaceArticlesPage() {
  const [searchParams] = useSearchParams();
  const edit = searchParams.get("edit");
  const qs = new URLSearchParams({ tab: edit ? "released" : "overview" });
  if (edit) qs.set("edit", edit);
  return <Navigate to={`/dashboard/super-admin/articles?${qs.toString()}`} replace />;
}
