import { useCallback, useEffect, useState } from "react";
import { getSuperAdminFreelancerBildazoIntegrationRequest } from "../../services/api";
import { getSafeApiErrorMessage } from "../../utils/apiErrorMessage";

function formatJoDateTime(value) {
  if (!value) return "—";
  const d = new Date(value);
  if (!Number.isFinite(d.getTime())) return "—";
  return new Intl.DateTimeFormat("ar-JO-u-nu-latn", {
    timeZone: "Asia/Amman",
    dateStyle: "medium",
    timeStyle: "short",
  }).format(d);
}

export default function SuperAdminFreelancerBildazoIntegrationPanel({ freelancerUserId }) {
  const [data, setData] = useState(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!freelancerUserId) return;
    setLoading(true);
    setError("");
    try {
      const res = await getSuperAdminFreelancerBildazoIntegrationRequest(freelancerUserId);
      setData(res?.data || null);
    } catch (err) {
      setData(null);
      setError(getSafeApiErrorMessage(err) || "تعذر تحميل ملخص تكامل Bildazo.");
    } finally {
      setLoading(false);
    }
  }, [freelancerUserId]);

  useEffect(() => {
    void load();
  }, [load]);

  if (!freelancerUserId) return null;

  return (
    <div
      className="mt-3 rounded-[10px] border border-[color:var(--dash-border,#c9d0da)] bg-[color:var(--dash-card,#fcfcfd)] p-3"
      data-testid="super-admin-bildazo-integration"
    >
      <h3 className="mb-2 mt-0 text-[0.95rem] font-extrabold">تكامل Bildazo</h3>
      {loading ? <p className="mb-0 text-[0.85rem]">جاري التحميل…</p> : null}
      {error ? <p className="mb-0 text-[0.85rem] text-[color:var(--dash-danger,#b42318)]">{error}</p> : null}
      {!loading && !error && data ? (
        <div className="grid gap-1 text-[0.85rem] font-semibold text-[color:var(--dash-text-secondary,#4b5563)]">
          <p className="mb-0">حالة الحساب: {data.accountStatus || "—"}</p>
          <p className="mb-0">Writer ID: {data.writerId || "—"} · Public ID: {data.writerPublicId || "—"}</p>
          {data.writerProfileUrl ? (
            <p className="mb-0">
              ملف الكاتب:{" "}
              <a href={data.writerProfileUrl} target="_blank" rel="noreferrer">
                {data.writerProfileUrl}
              </a>
            </p>
          ) : null}
          <p className="mb-0">
            منشور: {data.publishedArticlesCount ?? 0} · قيد الانتظار: {data.pendingPublishCount ?? 0} · فشل:{" "}
            {data.failedPublishCount ?? 0}
          </p>
          {data.lastPublishedArticle ? (
            <p className="mb-0">
              آخر مقال منشور: {data.lastPublishedArticle.title || "—"} ·{" "}
              {formatJoDateTime(data.lastPublishedArticle.publishedAt)}
            </p>
          ) : null}
          <p className="mb-0">
            حالة التكامل: بوابة {data.integrationStatus?.authorGateEnabled ? "مفعّلة" : "معطّلة"} · مزامنة{" "}
            {data.integrationStatus?.authorSyncEnabled ? "مفعّلة" : "معطّلة"} · نشر{" "}
            {data.integrationStatus?.articlePublishEnabled ? "مفعّل" : "معطّل"}
          </p>
          <p className="mb-0 text-[0.82rem]">{data.syncActionNoteAr}</p>
        </div>
      ) : null}
    </div>
  );
}
