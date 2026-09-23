import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { ArrowRight, ClipboardList } from "lucide-react";
import DashboardPageHeader from "../../components/dashboard/DashboardPageHeader";
import DashboardShell from "../../components/dashboard/DashboardShell";
import DashboardSection from "../../components/dashboard/DashboardSection";
import DashboardLoadingState from "../../components/dashboard/DashboardLoadingState";
import DashboardEmptyState from "../../components/dashboard/DashboardEmptyState";
import DashboardTable from "../../components/dashboard/DashboardTable";
import DashboardTabs, { DashboardTab } from "../../components/dashboard/DashboardTabs";
import { superAdminBreadcrumbs } from "../../components/dashboard/dashboardBreadcrumbs";
import { useTranslation } from "../../i18n/LanguageProvider";
import { useToast } from "../../components/ui/toastContext";
import {
  adminAcceptInstitutionWorkApplicantRequest,
  adminApproveInstitutionWorkDeliveryRequest,
  adminGetInstitutionWorkRequest,
  adminRejectInstitutionWorkApplicantRequest,
  adminRequestInstitutionWorkRevisionRequest,
} from "../../services/api";
import { getSafeApiErrorMessage } from "../../utils/apiErrorMessage";
import { ARTICLE_PACKAGE_PLAN_LABELS_AR } from "../../admin/marketplaceArticles/marketplaceArticleFormUtils";

const LIST_PATH = "/dashboard/super-admin/institutions";

function workTypeBadge(workType) {
  if (workType === "article") {
    return "border-violet-200 bg-violet-50 text-violet-900";
  }
  return "border-sky-200 bg-sky-50 text-sky-900";
}

function workTypeLabel(workType) {
  return workType === "article" ? "مقال" : "طلب";
}

function publicationBadgeClass(status) {
  if (status === "published") return "border-emerald-200 bg-emerald-50 text-emerald-900";
  return "border-amber-200 bg-amber-50 text-amber-900";
}

function applicantDisplayName(row) {
  return (
    row.freelancerName ||
    row.freelancerDisplayName ||
    row.userName ||
    row.email ||
    (row.freelancerUserId != null ? `#${row.freelancerUserId}` : "—")
  );
}

function applicantId(row) {
  return row.id ?? row.bidId ?? row.applicationId;
}

export default function SuperAdminInstitutionWorkDetailPage() {
  const { institutionId, workType: workTypeParam, workId } = useParams();
  const workType = String(workTypeParam || "order").toLowerCase();
  const { t, locale } = useTranslation();
  const { push } = useToast();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [bundle, setBundle] = useState(null);
  const [activeTab, setActiveTab] = useState("details");
  const [actionBusyId, setActionBusyId] = useState(null);
  const [revisionNote, setRevisionNote] = useState("");
  const [deliveryBusy, setDeliveryBusy] = useState(false);

  const formatDate = (value) => {
    if (!value) return "—";
    try {
      return new Date(value).toLocaleString(locale === "en" ? "en-GB" : "ar-JO");
    } catch {
      return String(value);
    }
  };

  const load = useCallback(async () => {
    if (!institutionId || !workId) return;
    setLoading(true);
    setError(null);
    try {
      const res = await adminGetInstitutionWorkRequest(institutionId, workType, workId);
      setBundle(res?.data || null);
    } catch (err) {
      setError(getSafeApiErrorMessage(err) || t("dashboard.institutions.sectionLoadError"));
      setBundle(null);
    } finally {
      setLoading(false);
    }
  }, [institutionId, workType, workId, t]);

  useEffect(() => {
    void load();
  }, [load]);

  const order = bundle?.order || null;
  const article = bundle?.article || null;
  const applicants = Array.isArray(bundle?.applicants) ? bundle.applicants : [];
  const title = order?.title || article?.title || `#${workId}`;
  const sourceLabel =
    bundle?.source === "storage" || order?.institutionalStorageId
      ? "من مخزون المؤسسة"
      : "مباشر";

  const tabs = useMemo(() => {
    const list = [{ id: "details", label: "التفاصيل" }];
    // Bidding-style applicants only; fixed/take uses pool claim (no bids tab).
    const showApplicants =
      workType === "article" || (workType === "order" && order?.projectType === "bidding");
    if (showApplicants) {
      list.push({ id: "applicants", label: workType === "article" ? "المتقدمون" : "العروض" });
    }
    const assigned =
      order?.assignedFreelancerId ||
      article?.assignedFreelancerId ||
      applicants.some((a) => ["selected", "assigned", "writing", "approved"].includes(String(a.status)));
    if (assigned || order?.orderStatus === "in_progress" || order?.projectType === "fixed") {
      list.push({ id: "execution", label: "التنفيذ" });
    }
    const deliveryRelevant =
      workType === "order"
        ? ["pending_client_review", "in_progress", "completed", "assigned", "ready_for_work"].includes(
            String(order?.orderStatus || ""),
          ) || Boolean(order?.assignedFreelancerId)
        : applicants.some(
            (a) =>
              ["submitted", "under_review", "revision_requested", "approved"].includes(String(a.status)) ||
              a.articleSubmission?.status === "submitted",
          );
    if (deliveryRelevant) list.push({ id: "delivery", label: "التسليم" });
    list.push({ id: "log", label: "السجل" });
    return list;
  }, [workType, order, article, applicants]);

  useEffect(() => {
    if (!tabs.some((tab) => tab.id === activeTab)) {
      setActiveTab(tabs[0]?.id || "details");
    }
  }, [tabs, activeTab]);

  const acceptApplicant = async (applicant) => {
    const id = applicantId(applicant);
    if (!id || actionBusyId) return;
    setActionBusyId(String(id));
    try {
      await adminAcceptInstitutionWorkApplicantRequest(institutionId, workType, workId, id, {});
      push({ type: "success", message: "تم قبول المتقدم." });
      await load();
    } catch (err) {
      push({ type: "error", message: getSafeApiErrorMessage(err) || "تعذر قبول المتقدم." });
    } finally {
      setActionBusyId(null);
    }
  };

  const rejectApplicant = async (applicant) => {
    const id = applicantId(applicant);
    if (!id || actionBusyId) return;
    setActionBusyId(String(id));
    try {
      await adminRejectInstitutionWorkApplicantRequest(institutionId, workType, workId, id, {});
      push({ type: "success", message: "تم رفض المتقدم." });
      await load();
    } catch (err) {
      push({ type: "error", message: getSafeApiErrorMessage(err) || "تعذر رفض المتقدم." });
    } finally {
      setActionBusyId(null);
    }
  };

  const approveDelivery = async (applicationId = null) => {
    if (deliveryBusy) return;
    setDeliveryBusy(true);
    try {
      const payload =
        workType === "article" ? { applicationId: applicationId || undefined } : {};
      await adminApproveInstitutionWorkDeliveryRequest(institutionId, workType, workId, payload);
      push({ type: "success", message: "تم اعتماد التسليم." });
      await load();
    } catch (err) {
      push({ type: "error", message: getSafeApiErrorMessage(err) || "تعذر اعتماد التسليم." });
    } finally {
      setDeliveryBusy(false);
    }
  };

  const requestRevision = async (applicationId = null) => {
    if (deliveryBusy) return;
    setDeliveryBusy(true);
    try {
      await adminRequestInstitutionWorkRevisionRequest(
        institutionId,
        workType,
        workId,
        revisionNote,
        [],
        workType === "article" ? { applicationId } : {},
      );
      push({ type: "success", message: "تم طلب التعديل." });
      setRevisionNote("");
      await load();
    } catch (err) {
      push({ type: "error", message: getSafeApiErrorMessage(err) || "تعذر طلب التعديل." });
    } finally {
      setDeliveryBusy(false);
    }
  };

  const detailBack = `${LIST_PATH}/${institutionId}?tab=orders`;

  if (loading && !bundle) {
    return (
      <DashboardShell>
        <DashboardLoadingState label={t("dashboard.institutions.loading")} />
      </DashboardShell>
    );
  }

  if (error && !bundle) {
    return (
      <DashboardShell>
        <DashboardEmptyState title={error} />
        <Link to={detailBack} className="btn btn-secondary mt-3">
          العودة للمؤسسة
        </Link>
      </DashboardShell>
    );
  }

  return (
    <DashboardShell className="oh-institution-work-detail">
      <DashboardPageHeader
        eyebrow="المؤسسات"
        title={title}
        description={`${workTypeLabel(workType)} · ${sourceLabel}`}
        breadcrumbs={[
          ...superAdminBreadcrumbs("dashboard.breadcrumbs.institutions"),
          { label: t("dashboard.institutions.title"), href: LIST_PATH },
          { label: institutionId, href: detailBack },
          { label: title },
        ]}
        actions={
          <Link to={detailBack} className="btn btn-secondary inline-flex items-center gap-2">
            <ArrowRight size={18} aria-hidden="true" />
            العودة للطلبات
          </Link>
        }
      />

      <div className="mb-3 flex flex-wrap items-center gap-2">
        <span className={`inline-flex rounded-full border px-2.5 py-0.5 text-xs font-medium ${workTypeBadge(workType)}`}>
          {workTypeLabel(workType)}
        </span>
        <span
          className={`inline-flex rounded-full border px-2.5 py-0.5 text-xs font-medium ${publicationBadgeClass(
            order?.isPublished ? "published" : article?.status === "published" ? "published" : "draft",
          )}`}
        >
          {order?.isPublished || article?.status === "published" ? "منشور" : "مسودة / غير منشور"}
        </span>
        <span className="inline-flex rounded-full border border-slate-200 bg-slate-50 px-2.5 py-0.5 text-xs text-slate-800">
          {sourceLabel}
        </span>
        {applicants.length ? (
          <span className="text-xs text-slate-600">المتقدمون: {applicants.length}</span>
        ) : null}
      </div>

      <DashboardTabs aria-label="أقسام العمل" className="mb-3">
        {tabs.map((tab) => (
          <DashboardTab key={tab.id} active={activeTab === tab.id} onClick={() => setActiveTab(tab.id)}>
            {tab.label}
          </DashboardTab>
        ))}
      </DashboardTabs>

      {activeTab === "details" ? (
        <DashboardSection title="التفاصيل">
          {workType === "order" && order ? (
            <dl className="grid gap-3 text-sm sm:grid-cols-2">
              <div>
                <dt className="text-slate-600">الحالة</dt>
                <dd className="font-medium text-slate-900">{order.orderStatus || "—"}</dd>
              </div>
              <div>
                <dt className="text-slate-600">رمز الطلب</dt>
                <dd className="font-medium text-slate-900">{order.orderCode || "—"}</dd>
              </div>
              <div>
                <dt className="text-slate-600">نوع المشروع</dt>
                <dd className="font-medium text-slate-900">{order.projectType || "—"}</dd>
              </div>
              <div>
                <dt className="text-slate-600">تاريخ الإنشاء</dt>
                <dd className="font-medium text-slate-900">{formatDate(order.createdAt)}</dd>
              </div>
              <div className="sm:col-span-2">
                <dt className="text-slate-600">الوصف</dt>
                <dd className="whitespace-pre-wrap break-words text-slate-900">{order.description || "—"}</dd>
              </div>
            </dl>
          ) : null}
          {workType === "article" && article ? (
            <dl className="grid gap-3 text-sm sm:grid-cols-2">
              <div>
                <dt className="text-slate-600">الحالة</dt>
                <dd className="font-medium text-slate-900">{article.status || "—"}</dd>
              </div>
              <div>
                <dt className="text-slate-600">المستوى / الخطة</dt>
                <dd className="font-medium text-slate-900">
                  {ARTICLE_PACKAGE_PLAN_LABELS_AR[article.activationPlanTierCode] ||
                    article.activationPlanTierCode ||
                    article.articleLevel ||
                    "—"}
                </dd>
              </div>
              <div>
                <dt className="text-slate-600">تاريخ الإنشاء</dt>
                <dd className="font-medium text-slate-900">{formatDate(article.createdAt)}</dd>
              </div>
              <div className="sm:col-span-2">
                <dt className="text-slate-600">الوصف</dt>
                <dd className="whitespace-pre-wrap break-words text-slate-900">{article.description || "—"}</dd>
              </div>
            </dl>
          ) : null}
        </DashboardSection>
      ) : null}

      {activeTab === "applicants" ? (
        <DashboardSection title="المتقدمون" description="قبول أو رفض المتقدمين عبر واجهة المؤسسة (بدون Stripe).">
          {applicants.length === 0 ? (
            <DashboardEmptyState title="لا متقدمين حالياً." icon={<ClipboardList size={28} aria-hidden="true" />} />
          ) : (
            <DashboardTable caption="المتقدمون">
              <thead>
                <tr>
                  <th>المستقل</th>
                  <th>الحالة</th>
                  {workType === "order" ? <th>العرض</th> : null}
                  <th>عضو مؤسسة</th>
                  <th>{t("dashboard.institutions.actions")}</th>
                </tr>
              </thead>
              <tbody>
                {applicants.map((a) => {
                  const id = applicantId(a);
                  const pending =
                    workType === "order"
                      ? String(a.status || "pending") === "pending"
                      : ["pending", "submitted"].includes(String(a.status));
                  return (
                    <tr key={String(id)}>
                      <td className="max-w-[14rem] break-words">{applicantDisplayName(a)}</td>
                      <td>{a.status || "—"}</td>
                      {workType === "order" ? (
                        <td>
                          <bdi dir="ltr" className="oh-num">
                            {a.bidAmount != null ? a.bidAmount : a.amount ?? "—"}
                          </bdi>
                        </td>
                      ) : null}
                      <td>{a.isInstitutionMember ? "نعم" : "—"}</td>
                      <td>
                        {pending ? (
                          <div className="flex flex-wrap gap-2">
                            <button
                              type="button"
                              className="btn btn-primary btn-sm"
                              disabled={actionBusyId === String(id)}
                              onClick={() => void acceptApplicant(a)}
                            >
                              قبول
                            </button>
                            <button
                              type="button"
                              className="btn btn-secondary btn-sm"
                              disabled={actionBusyId === String(id)}
                              onClick={() => void rejectApplicant(a)}
                            >
                              رفض
                            </button>
                          </div>
                        ) : (
                          "—"
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </DashboardTable>
          )}
        </DashboardSection>
      ) : null}

      {activeTab === "execution" ? (
        <DashboardSection title="التنفيذ">
          <dl className="grid gap-3 text-sm sm:grid-cols-2">
            <div>
              <dt className="text-slate-600">المستقل المعيّن</dt>
              <dd className="font-medium text-slate-900">
                {order?.assignedFreelancerName ||
                  applicants.find((a) => ["selected", "assigned", "writing", "approved"].includes(String(a.status)))
                    ?.freelancerName ||
                  "—"}
              </dd>
            </div>
            <div>
              <dt className="text-slate-600">حالة التنفيذ</dt>
              <dd className="font-medium text-slate-900">{order?.orderStatus || article?.status || "—"}</dd>
            </div>
          </dl>
        </DashboardSection>
      ) : null}

      {activeTab === "delivery" ? (
        <DashboardSection title="التسليم">
          {workType === "article" ? (
            <div className="grid gap-4">
              {applicants
                .filter(
                  (a) =>
                    a.articleSubmission?.status === "submitted" ||
                    ["submitted", "under_review", "revision_requested"].includes(String(a.status)),
                )
                .map((a) => (
                  <div key={String(applicantId(a))} className="rounded-xl border border-slate-200 p-4">
                    <p className="mt-0 text-sm font-medium text-slate-900">{applicantDisplayName(a)}</p>
                    <p className="text-xs text-slate-600">حالة التسليم: {a.articleSubmission?.status || a.status}</p>
                    <div className="mt-3 flex flex-wrap gap-2">
                      <button
                        type="button"
                        className="btn btn-primary btn-sm"
                        disabled={deliveryBusy}
                        onClick={() => void approveDelivery(applicantId(a))}
                      >
                        اعتماد التسليم
                      </button>
                    </div>
                  </div>
                ))}
              {!applicants.some(
                (a) =>
                  a.articleSubmission?.status === "submitted" ||
                  ["submitted", "under_review"].includes(String(a.status)),
              ) ? (
                <DashboardEmptyState title="لا تسليمات بانتظار المراجعة." />
              ) : null}
            </div>
          ) : (
            <div className="grid gap-3 max-w-xl">
              <p className="m-0 text-sm text-slate-700">اعتماد تسليم الطلب أو طلب تعديل من المستقل.</p>
              <label className="grid gap-1 text-sm">
                <span className="text-slate-700">ملاحظة التعديل (اختياري)</span>
                <textarea
                  className="form-control min-h-[96px]"
                  value={revisionNote}
                  onChange={(e) => setRevisionNote(e.target.value)}
                />
              </label>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  className="btn btn-primary"
                  disabled={deliveryBusy}
                  onClick={() => void approveDelivery()}
                >
                  اعتماد التسليم
                </button>
                <button
                  type="button"
                  className="btn btn-secondary"
                  disabled={deliveryBusy}
                  onClick={() => void requestRevision()}
                >
                  طلب تعديل
                </button>
              </div>
            </div>
          )}
          {workType === "article" ? (
            <div className="mt-4 grid gap-2 max-w-xl">
              <label className="grid gap-1 text-sm">
                <span className="text-slate-700">ملاحظة طلب تعديل (مقال)</span>
                <textarea
                  className="form-control min-h-[80px]"
                  value={revisionNote}
                  onChange={(e) => setRevisionNote(e.target.value)}
                />
              </label>
              <button
                type="button"
                className="btn btn-secondary btn-sm"
                disabled={deliveryBusy || !revisionNote.trim()}
                onClick={() => {
                  const target = applicants.find((a) => a.articleSubmission?.status === "submitted");
                  if (target) void requestRevision(applicantId(target));
                }}
              >
                طلب تعديل للتسليم الحالي
              </button>
            </div>
          ) : null}
        </DashboardSection>
      ) : null}

      {activeTab === "log" ? (
        <DashboardSection title="السجل">
          <ul className="m-0 grid list-none gap-2 p-0 text-sm text-slate-800">
            <li>
              <span className="text-slate-600">المصدر: </span>
              {sourceLabel}
            </li>
            <li>
              <span className="text-slate-600">نوع العمل: </span>
              {workTypeLabel(workType)}
            </li>
            <li>
              <span className="text-slate-600">المعرّف: </span>
              <bdi dir="ltr">{workId}</bdi>
            </li>
            <li>
              <span className="text-slate-600">آخر تحميل: </span>
              {formatDate(new Date().toISOString())}
            </li>
          </ul>
          <p className="mb-0 mt-3 text-xs text-slate-500">
            سجل التدقيق التفصيلي للمؤسسة يُعرض في تقارير الإدارة — هذه الصفحة تعرض ملخصاً تشغيلياً فقط.
          </p>
        </DashboardSection>
      ) : null}
    </DashboardShell>
  );
}
