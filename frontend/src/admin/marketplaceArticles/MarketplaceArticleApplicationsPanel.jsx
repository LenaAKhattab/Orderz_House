import { useCallback, useEffect, useState } from "react";
import Button from "../../components/ui/Button";
import {
  listAdminArticleApplicationsRequest,
  rejectAdminArticleApplicationRequest,
  selectAdminArticleApplicationRequest,
} from "../../services/api";
import { getSafeApiErrorMessage } from "../../utils/apiErrorMessage";

export default function MarketplaceArticleApplicationsPanel({
  articleId,
  isEn = false,
  onToast,
}) {
  const [applications, setApplications] = useState([]);
  const [loading, setLoading] = useState(false);
  const [busyId, setBusyId] = useState(null);
  const [error, setError] = useState("");

  const refresh = useCallback(async () => {
    if (!articleId) return;
    setLoading(true);
    setError("");
    try {
      const res = await listAdminArticleApplicationsRequest(articleId);
      setApplications(Array.isArray(res?.data?.applications) ? res.data.applications : []);
    } catch (err) {
      setError(
        getSafeApiErrorMessage(err) ||
          (isEn ? "Failed to load applications." : "تعذر تحميل الطلبات."),
      );
      setApplications([]);
    } finally {
      setLoading(false);
    }
  }, [articleId, isEn]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const act = async (applicationId, action) => {
    setBusyId(applicationId);
    try {
      if (action === "select") {
        await selectAdminArticleApplicationRequest(applicationId);
        onToast?.({
          type: "success",
          message: isEn ? "Applicant selected." : "تم اختيار المتقدم.",
        });
      } else {
        await rejectAdminArticleApplicationRequest(applicationId);
        onToast?.({
          type: "success",
          message: isEn ? "Application rejected." : "تم رفض الطلب.",
        });
      }
      await refresh();
    } catch (err) {
      onToast?.({
        type: "error",
        message: getSafeApiErrorMessage(err) || (isEn ? "Action failed." : "فشل الإجراء."),
      });
    } finally {
      setBusyId(null);
    }
  };

  if (!articleId) return null;

  return (
    <section style={{ marginTop: 16, paddingTop: 12, borderTop: "1px solid rgba(0,0,0,0.08)" }}>
      <h4 style={{ margin: "0 0 8px" }}>
        {isEn ? "Applications" : "طلبات التقديم"}
        {!loading ? ` (${applications.length})` : ""}
      </h4>
      {loading ? <p style={{ opacity: 0.75 }}>{isEn ? "Loading…" : "جارٍ التحميل…"}</p> : null}
      {error ? <p style={{ color: "#b00020" }}>{error}</p> : null}
      {!loading && !error && applications.length === 0 ? (
        <p style={{ opacity: 0.75, margin: 0 }}>
          {isEn ? "No applications yet." : "لا توجد طلبات بعد."}
        </p>
      ) : null}
      <ul style={{ listStyle: "none", margin: 0, padding: 0, display: "grid", gap: 10 }}>
        {applications.map((app) => (
          <li
            key={app.id}
            style={{
              padding: 10,
              border: "1px solid rgba(0,0,0,0.08)",
              display: "grid",
              gap: 6,
            }}
          >
            <div>
              <strong>
                {app.freelancerFirstName || ""} {app.freelancerFamilyName || ""}
              </strong>{" "}
              <span style={{ opacity: 0.75 }}>({app.freelancerAccountId || app.freelancerUserId})</span>
            </div>
            <div style={{ fontSize: "0.9rem" }}>
              {isEn ? "Status" : "الحالة"}: <strong>{app.status}</strong>
              {" · "}
              {isEn ? "Access snapshot" : "لقطة الوصول"}: {app.membershipArticleAccessLevelSnapshot}
              {" · "}
              {isEn ? "Article level" : "مستوى المقال"}: {app.articleLevelSnapshot}
            </div>
            {app.bidEconomics ? (
              <div style={{ fontSize: "0.85rem", opacity: 0.9 }}>
                {isEn ? "Bid economics" : "اقتصاد العرض"}:{" "}
                {app.bidEconomics.chargeStatus === "charged"
                  ? isEn
                    ? "charged · 1 Bid"
                    : "مخصوم · عرض واحد"
                  : app.bidEconomics.chargeStatus}
                {app.bidEconomics.refundStatus === "refunded"
                  ? isEn
                    ? ` · refunded${app.bidEconomics.refundMode ? ` (${app.bidEconomics.refundMode})` : ""}`
                    : ` · مسترد${app.bidEconomics.refundMode ? ` (${app.bidEconomics.refundMode})` : ""}`
                  : ""}
              </div>
            ) : null}
            {app.proposalMessage ? (
              <p style={{ margin: 0, fontSize: "0.9rem", opacity: 0.85 }}>{app.proposalMessage}</p>
            ) : null}
            {app.status === "pending" ? (
              <div style={{ display: "flex", gap: 8 }}>
                <Button
                  type="button"
                  disabled={busyId === app.id}
                  onClick={() => act(app.id, "select")}
                >
                  {isEn ? "Select" : "اختيار"}
                </Button>
                <Button
                  type="button"
                  variant="secondary"
                  disabled={busyId === app.id}
                  onClick={() => act(app.id, "reject")}
                >
                  {isEn ? "Reject" : "رفض"}
                </Button>
              </div>
            ) : null}
          </li>
        ))}
      </ul>
    </section>
  );
}
