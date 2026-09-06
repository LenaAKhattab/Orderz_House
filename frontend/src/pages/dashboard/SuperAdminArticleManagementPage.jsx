import { Navigate, useSearchParams } from "react-router-dom";

/** Legacy «إدارة المقالات» — redirects into الموحدة «المقالات». */
export default function SuperAdminArticleManagementPage() {
  const [searchParams] = useSearchParams();
  const tab = searchParams.get("tab");
  const map = {
    articles: "inventory",
    fund: "funding",
    alloc: "funding",
    inventory: "inventory",
    release: "funding",
    monitor: "released",
  };
  const nextTab = map[tab] || "overview";
  const qs = new URLSearchParams({ tab: nextTab });
  const edit = searchParams.get("edit");
  if (edit) qs.set("edit", edit);
  return <Navigate to={`/dashboard/super-admin/articles?${qs.toString()}`} replace />;
}
