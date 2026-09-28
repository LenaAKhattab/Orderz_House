import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  acceptAdminPantryBidRequest,
  approveAdminPantryDeliveryRequest,
  createAdminPantryRequestRequest,
  getAdminPantryRequestRequest,
  getCategoriesRequest,
  getCategorySubSubcategoriesRequest,
  listAdminPantryDeliveriesRequest,
  listAdminPantryRequestsRequest,
  publishAdminPantryRequestRequest,
  rejectAdminPantryBidRequest,
  relistAdminPantryBidCollectionRequest,
  requestRevisionAdminPantryDeliveryRequest,
} from "../../services/api";
import { useToast } from "../../components/ui/toastContext";
import {
  ARTICLE_ALLOWED_REQUIRED_BID_COUNTS,
  canSelectArticleApplicant,
  canRelistBidCollection,
  formatArticleBidCollectionLabel,
  isFairRankingEligible,
  isRecommendedPantryBid,
} from "../../admin/marketplaceArticles/marketplaceArticleFormUtils";
import FairSelectionOverrideDialog from "../../admin/marketplaceArticles/FairSelectionOverrideDialog";
import {
  ADMIN_LIST_REFRESH_SOFT_NOTE,
  createAdminListRequestGate,
  isAdminListAbortError,
} from "../../lib/staff/adminListLoad";
import { getSafeApiErrorMessage } from "../../utils/apiErrorMessage";
import { useTranslation } from "../../i18n/LanguageProvider";
import "../../i18n/pantryResources";
import "./pantryPages.css";

const EMPTY_FORM = {
  title: "",
  description: "",
  categoryId: "",
  subSubcategoryId: "",
  pricingType: "fixed",
  fixedBudget: "",
  budgetMin: "",
  budgetMax: "",
  deliveryDays: "",
  skillsText: "",
  requirements: "",
  attachmentUrl: "",
  attachmentName: "",
  internalNotes: "",
  publish: true,
  applicationBidCost: "1",
  targetApplicantCount: "",
  applicationDeadlineAt: "",
  requiredBidCount: "",
  minRequiredBidsAcknowledged: false,
  eligibleTiers: { starter: false, silver: false, pro: false, elite: false },
};

function formatBudget(row) {
  if (row.pricingType === "bidding" || (row.budgetMin != null || row.budgetMax != null)) {
    if (row.fixedBudget != null && row.pricingType !== "bidding") return `${row.fixedBudget}`;
    return `${row.budgetMin ?? "—"} – ${row.budgetMax ?? "—"}`;
  }
  if (row.fixedBudget != null) return `${row.fixedBudget}`;
  return "—";
}

function apiErrorMessage(err, fallback) {
  const data = err?.response?.data;
  if (data?.fieldErrors && typeof data.fieldErrors === "object") {
    const first = Object.values(data.fieldErrors).find(Boolean);
    if (first) return String(first);
  }
  return data?.message || fallback;
}

export default function AdminPantryPage() {
  const { t, locale, dir } = useTranslation();
  const toast = useToast();
  const statusLabels = useMemo(
    () => ({
      draft: t("pantry.status.draft"),
      open_for_bids: t("pantry.status.open_for_bids"),
      assigned: t("pantry.status.assigned"),
      in_progress: t("pantry.status.in_progress"),
      submitted: t("pantry.status.submitted"),
      revision_requested: t("pantry.status.revision_requested"),
      approved: t("pantry.status.approved"),
      archived: t("pantry.status.archived"),
    }),
    [t],
  );
  const dateLocale = locale === "en" ? "en-JO-u-nu-latn" : "ar-JO-u-nu-latn";
  const [tab, setTab] = useState("requests");
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [requests, setRequests] = useState([]);
  const [stats, setStats] = useState(null);
  const [deliveries, setDeliveries] = useState([]);
  const [requestsError, setRequestsError] = useState(null);
  const [deliveriesError, setDeliveriesError] = useState(null);
  const [listSoftNote, setListSoftNote] = useState("");
  const listGateRef = useRef(null);
  if (!listGateRef.current) listGateRef.current = createAdminListRequestGate();
  const hasListDataRef = useRef(false);
  const [selectedId, setSelectedId] = useState(null);
  const [detail, setDetail] = useState(null);
  const [showCreate, setShowCreate] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);
  const [fieldErrors, setFieldErrors] = useState({});
  const [categories, setCategories] = useState([]);
  const [subSubs, setSubSubs] = useState([]);
  const [saving, setSaving] = useState(false);
  const [relisting, setRelisting] = useState(false);
  const [overrideBidId, setOverrideBidId] = useState(null);
  const acceptingRef = useRef(false);
  const [integrationActive, setIntegrationActive] = useState(false);

  const loadList = useCallback(async () => {
    const hasExisting = hasListDataRef.current;
    const ticket = listGateRef.current.begin();
    if (hasExisting) {
      setRefreshing(true);
      setListSoftNote("");
    } else {
      setLoading(true);
      setRequestsError(null);
      setDeliveriesError(null);
    }

    let reqFailed = false;
    let delFailed = false;

    const reqPromise = listAdminPantryRequestsRequest({}, { signal: ticket.signal })
      .then((reqRes) => {
        if (!ticket.isCurrent()) return;
        setRequests(reqRes?.data?.requests || []);
        setStats(reqRes?.data?.stats || null);
        setIntegrationActive(Boolean(reqRes?.data?.pantryMembershipBidIntegrationActive));
        setRequestsError(null);
      })
      .catch((err) => {
        if (!ticket.isCurrent() || isAdminListAbortError(err)) return;
        reqFailed = true;
        if (!hasExisting) {
          setRequests([]);
          setStats(null);
          const msg = apiErrorMessage(err, t("pantry.errors.loadRequests"));
          setRequestsError(msg);
          toast?.error?.(msg);
        }
      });

    const delPromise = listAdminPantryDeliveriesRequest({}, { signal: ticket.signal })
      .then((delRes) => {
        if (!ticket.isCurrent()) return;
        setDeliveries(delRes?.data?.deliveries || []);
        setDeliveriesError(null);
      })
      .catch((err) => {
        if (!ticket.isCurrent() || isAdminListAbortError(err)) return;
        delFailed = true;
        if (!hasExisting) {
          setDeliveries([]);
          const msg = apiErrorMessage(err, t("pantry.errors.loadDeliveries"));
          setDeliveriesError(msg);
        }
      });

    await Promise.allSettled([reqPromise, delPromise]);
    if (!ticket.isCurrent()) return;
    if (hasExisting && (reqFailed || delFailed)) {
      setListSoftNote(ADMIN_LIST_REFRESH_SOFT_NOTE);
    } else if (!reqFailed && !delFailed) {
      hasListDataRef.current = true;
      setListSoftNote("");
    }
    setLoading(false);
    setRefreshing(false);
  }, [toast]);

  useEffect(() => {
    void loadList();
    return () => listGateRef.current?.abortInFlight();
  }, [loadList]);

  useEffect(() => {
    if (!showCreate) return;
    let cancelled = false;
    (async () => {
      try {
        const res = await getCategoriesRequest();
        if (!cancelled) setCategories(res?.data || []);
      } catch {
        if (!cancelled) setCategories([]);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [showCreate]);

  useEffect(() => {
    if (!form.categoryId) {
      setSubSubs([]);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const res = await getCategorySubSubcategoriesRequest(form.categoryId);
        const list = res?.data || res?.subSubcategories || res || [];
        if (!cancelled) setSubSubs(Array.isArray(list) ? list : []);
      } catch {
        if (!cancelled) setSubSubs([]);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [form.categoryId]);

  const openDetail = async (id) => {
    setSelectedId(id);
    try {
      const res = await getAdminPantryRequestRequest(id);
      setDetail(res?.data || null);
      if (res?.data?.pantryMembershipBidIntegrationActive != null) {
        setIntegrationActive(Boolean(res.data.pantryMembershipBidIntegrationActive));
      }
    } catch (err) {
      toast?.error?.(apiErrorMessage(err, t("pantry.errors.openRequest")));
    }
  };

  const relistBidCollection = async () => {
    if (!detail?.request?.id || relisting) return;
    setRelisting(true);
    try {
      const res = await relistAdminPantryBidCollectionRequest(detail.request.id);
      setDetail(res?.data || null);
      toast?.success?.(t("pantry.toast.relistSuccess"));
      await loadList();
    } catch (err) {
      toast?.error?.(apiErrorMessage(err, t("pantry.errors.relist")));
    } finally {
      setRelisting(false);
    }
  };

  const validateClient = () => {
    const errors = {};
    if (String(form.title || "").trim().length < 2) {
      errors.title = t("pantry.errors.titleRequired");
    }
    if (String(form.description || "").trim().length < 10) {
      errors.description = t("pantry.errors.descriptionRequired");
    }
    if (!String(form.categoryId || "").trim()) {
      errors.categoryId = t("pantry.errors.categoryRequired");
    }
    if (!["fixed", "bidding"].includes(form.pricingType)) {
      errors.pricingType = t("pantry.errors.pricingTypeRequired");
    }
    if (form.pricingType === "fixed") {
      if (!(Number(form.fixedBudget) > 0)) {
        errors.fixedBudget = t("pantry.errors.fixedBudgetRequired");
      }
      if (!(Number(form.deliveryDays) > 0)) {
        errors.deliveryDays = t("pantry.errors.deliveryDaysRequired");
      }
    } else {
      const min = form.budgetMin === "" ? null : Number(form.budgetMin);
      const max = form.budgetMax === "" ? null : Number(form.budgetMax);
      if (min != null && !(Number.isFinite(min) && min >= 0)) {
        errors.budgetMin = t("pantry.errors.budgetMinInvalid");
      }
      if (max != null && !(Number.isFinite(max) && max >= 0)) {
        errors.budgetMax = t("pantry.errors.budgetMaxInvalid");
      }
      if (min != null && max != null && min > max) {
        errors.budgetMax = t("pantry.errors.budgetMaxLessThanMin");
      }
    }
    return errors;
  };

  const createRequest = async (e) => {
    e.preventDefault();
    const errors = validateClient();
    setFieldErrors(errors);
    if (Object.keys(errors).length) {
      toast?.error?.(Object.values(errors)[0]);
      return;
    }

    const selectedSs = subSubs.find((ss) => String(ss.id) === String(form.subSubcategoryId));
    const inferredSubcat =
      selectedSs?.subcategoryId != null
        ? Number(selectedSs.subcategoryId)
        : selectedSs?.subcategory_id != null
          ? Number(selectedSs.subcategory_id)
          : null;

    const attachments = [];
    if (String(form.attachmentUrl || "").trim()) {
      attachments.push({
        fileUrl: String(form.attachmentUrl).trim(),
        fileName: String(form.attachmentName || "").trim() || "file",
      });
    }

    const payload = {
      title: form.title.trim(),
      description: form.description.trim(),
      categoryId: Number(form.categoryId),
      subcategoryId: Number.isFinite(inferredSubcat) && inferredSubcat > 0 ? inferredSubcat : null,
      subSubcategoryId: form.subSubcategoryId ? Number(form.subSubcategoryId) : null,
      pricingType: form.pricingType,
      fixedBudget: form.pricingType === "fixed" ? Number(form.fixedBudget) : null,
      budgetMin: form.pricingType === "bidding" && form.budgetMin !== "" ? Number(form.budgetMin) : null,
      budgetMax: form.pricingType === "bidding" && form.budgetMax !== "" ? Number(form.budgetMax) : null,
      deliveryDays: form.deliveryDays !== "" ? Number(form.deliveryDays) : null,
      skills: form.skillsText,
      requirements: form.requirements.trim() || null,
      attachments,
      internalNotes: form.internalNotes.trim() || null,
      publish: Boolean(form.publish),
    };
    if (integrationActive) {
      payload.applicationBidCost = form.applicationBidCost !== "" ? Number(form.applicationBidCost) : null;
      payload.targetApplicantCount =
        form.targetApplicantCount !== "" ? Number(form.targetApplicantCount) : null;
      payload.applicationDeadlineAt = form.applicationDeadlineAt || null;
      const codes = Object.entries(form.eligibleTiers || {})
        .filter(([, on]) => on)
        .map(([code]) => code);
      payload.eligibleTierCodes = codes.length ? codes : null;
    }
    if (form.requiredBidCount !== "") {
      payload.requiredBidCount = Number(form.requiredBidCount);
      payload.minRequiredBidsAcknowledged = Boolean(form.minRequiredBidsAcknowledged);
    }

    setSaving(true);
    try {
      await createAdminPantryRequestRequest(payload);
      toast?.success?.(t("pantry.toast.created"));
      setShowCreate(false);
      setForm(EMPTY_FORM);
      setFieldErrors({});
      await loadList();
    } catch (err) {
      const fe = err?.response?.data?.fieldErrors;
      if (fe && typeof fe === "object") setFieldErrors(fe);
      toast?.error?.(apiErrorMessage(err, t("pantry.errors.createFailed")));
    } finally {
      setSaving(false);
    }
  };

  const onPublish = async (id) => {
    try {
      await publishAdminPantryRequestRequest(id);
      toast?.success?.(t("pantry.toast.published"));
      await loadList();
      if (selectedId === id) await openDetail(id);
    } catch (err) {
      toast?.error?.(apiErrorMessage(err, t("pantry.errors.publishFailed")));
    }
  };

  const onAcceptBid = async (bidId, overrideReason) => {
    if (acceptingRef.current) return;
    const fairRanking = detail?.fairRanking;
    if (
      overrideReason == null &&
      isFairRankingEligible(fairRanking) &&
      !isRecommendedPantryBid(bidId, fairRanking)
    ) {
      setOverrideBidId(bidId);
      return;
    }
    try {
      acceptingRef.current = true;
      await acceptAdminPantryBidRequest(
        selectedId,
        bidId,
        overrideReason ? { overrideReason } : {},
      );
      toast?.success?.(t("pantry.toast.bidAccepted"));
      await loadList();
      await openDetail(selectedId);
    } catch (err) {
      toast?.error?.(apiErrorMessage(err, t("pantry.errors.acceptBidFailed")));
    } finally {
      acceptingRef.current = false;
    }
  };

  const onRejectBid = async (bidId) => {
    try {
      await rejectAdminPantryBidRequest(selectedId, bidId);
      toast?.success?.(t("pantry.toast.bidRejected"));
      await openDetail(selectedId);
    } catch (err) {
      toast?.error?.(apiErrorMessage(err, t("pantry.errors.rejectBidFailed")));
    }
  };

  const onApproveDelivery = async (deliveryId, archive = false) => {
    try {
      await approveAdminPantryDeliveryRequest(deliveryId, { archive });
      toast?.success?.(archive ? t("pantry.toast.approvedArchived") : t("pantry.toast.approvedReady"));
      await loadList();
      if (selectedId) await openDetail(selectedId);
    } catch (err) {
      toast?.error?.(apiErrorMessage(err, t("pantry.errors.approveFailed")));
    }
  };

  const onRequestRevision = async (deliveryId) => {
    const feedback = window.prompt(t("pantry.prompt.revisionFeedback")) || "";
    try {
      await requestRevisionAdminPantryDeliveryRequest(deliveryId, { feedback });
      toast?.success?.(t("pantry.toast.revisionRequested"));
      await loadList();
      if (selectedId) await openDetail(selectedId);
    } catch (err) {
      toast?.error?.(apiErrorMessage(err, t("pantry.errors.revisionFailed")));
    }
  };

  const statsCards = useMemo(
    () => [
      { label: t("pantry.stats.open"), value: stats?.openCount ?? 0 },
      { label: t("pantry.stats.inProgress"), value: stats?.inProgressCount ?? 0 },
      { label: t("pantry.stats.pendingReview"), value: stats?.pendingReviewCount ?? 0 },
      { label: t("pantry.stats.approved"), value: stats?.approvedCount ?? 0 },
    ],
    [stats, t],
  );

  const categoryOptions = useMemo(
    () =>
      (categories || []).map((c) => ({
        id: String(c.id),
        label: c.nameAr || c.name_ar || c.name || c.title || `#${c.id}`,
      })),
    [categories],
  );

  return (
    <div className="pantry-page" dir={dir}>
      <header className="pantry-page__header">
        <div>
          <h1>{t("pantry.title")}</h1>
          <p>{t("pantry.subtitle")}</p>
        </div>
        <button type="button" className="btn btn-primary" onClick={() => setShowCreate(true)}>
          {t("pantry.createNew")}
        </button>
      </header>

      {listSoftNote || refreshing ? (
        <p className="mb-3 text-sm" style={{ color: listSoftNote ? "#b45309" : "#64748b" }} role="status">
          {refreshing ? t("pantry.refreshing") : listSoftNote}
        </p>
      ) : null}

      <div className="mb-4 flex flex-wrap gap-2">
        <button
          type="button"
          className={
            tab === "requests"
              ? "cursor-pointer rounded-lg border border-[var(--dash-primary,#2f3b65)] bg-[var(--dash-primary,#2f3b65)] px-[0.9rem] py-[0.45rem] font-bold text-[var(--dash-text-inverse,#fff)]"
              : "cursor-pointer rounded-lg border border-[var(--dash-border,#c9d0da)] bg-[var(--dash-card,#fff)] px-[0.9rem] py-[0.45rem] font-bold text-[var(--dash-primary,#2f3b65)]"
          }
          onClick={() => setTab("requests")}
        >
          {t("pantry.tabRequests")}
        </button>
        <button
          type="button"
          className={
            tab === "deliveries"
              ? "cursor-pointer rounded-lg border border-[var(--dash-primary,#2f3b65)] bg-[var(--dash-primary,#2f3b65)] px-[0.9rem] py-[0.45rem] font-bold text-[var(--dash-text-inverse,#fff)]"
              : "cursor-pointer rounded-lg border border-[var(--dash-border,#c9d0da)] bg-[var(--dash-card,#fff)] px-[0.9rem] py-[0.45rem] font-bold text-[var(--dash-primary,#2f3b65)]"
          }
          onClick={() => setTab("deliveries")}
        >
          {t("pantry.tabDeliveries")}
        </button>
      </div>

      {tab === "requests" && (
        <>
          <div className="pantry-stats">
            {statsCards.map((c) => (
              <div key={c.label} className="pantry-stats__card">
                <span>{c.label}</span>
                <strong>{c.value}</strong>
              </div>
            ))}
          </div>

          {requestsError && (
            <div className="pantry-banner pantry-banner--warn" role="alert">
              {requestsError}
            </div>
          )}

          {loading && requests.length === 0 ? (
            <p>{t("pantry.loading")}</p>
          ) : (
            <div className="pantry-table-wrap">
              <table className="pantry-table">
                <thead>
                  <tr>
                    <th>{t("pantry.table.title")}</th>
                    <th>{t("pantry.table.type")}</th>
                    <th>{t("pantry.table.status")}</th>
                    <th>{t("pantry.table.budget")}</th>
                    <th>{t("pantry.table.bidsCount")}</th>
                    {integrationActive ? <th>{t("pantry.table.applicationCost")}</th> : null}
                    <th>{t("pantry.table.freelancer")}</th>
                    <th>{t("pantry.table.createdAt")}</th>
                    <th>{t("pantry.table.actions")}</th>
                  </tr>
                </thead>
                <tbody>
                  {requests.map((row) => (
                    <tr key={row.id}>
                      <td>{row.title}</td>
                      <td>{row.pricingType === "bidding" ? t("pantry.pricingType.bidding") : t("pantry.pricingType.fixed")}</td>
                      <td>{statusLabels[row.status] || row.status}</td>
                      <td>{formatBudget(row)}</td>
                      <td>
                        {row.bidCollection?.label ||
                          (row.requiredBidCount
                            ? t("pantry.applicantsRequired", { current: row.validApplicantCount ?? 0, required: row.requiredBidCount })
                            : integrationActive && row.targetApplicantCount != null
                            ? `${row.validApplicantCount ?? 0} / ${row.targetApplicantCount}`
                            : row.bidsCount ?? 0)}
                      </td>
                      {integrationActive ? <td>{row.applicationBidCost ?? 1}</td> : null}
                      <td>{row.assignedFreelancerName || "—"}</td>
                      <td>{row.createdAt ? new Date(row.createdAt).toLocaleDateString(dateLocale) : "—"}</td>
                      <td className="pantry-actions">
                        <button type="button" className="btn btn-secondary btn-sm" onClick={() => openDetail(row.id)}>
                          {t("pantry.view")}
                        </button>
                        {row.status === "draft" && (
                          <button type="button" className="btn btn-primary btn-sm" onClick={() => onPublish(row.id)}>
                            {t("pantry.publish")}
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                  {!requests.length && (
                    <tr>
                      <td colSpan={integrationActive ? 9 : 8}>{requestsError ? "—" : t("pantry.emptyRequests")}</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}

      {tab === "deliveries" && (
        <>
          {deliveriesError && (
            <div className="pantry-banner pantry-banner--warn" role="alert">
              {deliveriesError}
            </div>
          )}
          <div className="pantry-table-wrap">
            <table className="pantry-table">
              <thead>
                <tr>
                  <th>{t("pantry.table.requestTitle")}</th>
                  <th>{t("pantry.table.freelancer")}</th>
                  <th>{t("pantry.table.status")}</th>
                  <th>{t("pantry.table.deliveredAt")}</th>
                  <th>{t("pantry.table.files")}</th>
                  <th>{t("pantry.table.adminNotes")}</th>
                  <th>{t("pantry.table.actions")}</th>
                </tr>
              </thead>
              <tbody>
                {deliveries.map((d) => (
                  <tr key={d.id}>
                    <td>{d.requestTitle}</td>
                    <td>{d.freelancerName || d.freelancerId}</td>
                    <td>{statusLabels[d.status] || d.status}</td>
                    <td>{d.createdAt ? new Date(d.createdAt).toLocaleString(dateLocale) : "—"}</td>
                    <td>
                      {(d.files || []).map((f) => (
                        <a key={f.id} href={f.fileUrl} target="_blank" rel="noreferrer">
                          {f.fileName}
                        </a>
                      ))}
                      {!d.files?.length && "—"}
                    </td>
                    <td>{d.adminFeedback || "—"}</td>
                    <td className="pantry-actions">
                      {d.status === "submitted" && (
                        <>
                          <button type="button" className="btn btn-primary btn-sm" onClick={() => onApproveDelivery(d.id)}>
                            {t("pantry.approveDelivery")}
                          </button>
                          <button type="button" className="btn btn-secondary btn-sm" onClick={() => onRequestRevision(d.id)}>
                            {t("pantry.requestRevision")}
                          </button>
                        </>
                      )}
                      {d.status === "approved" && (
                        <button type="button" className="btn btn-secondary btn-sm" onClick={() => onApproveDelivery(d.id, true)}>
                          {t("pantry.archiveDelivery")}
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
                {!deliveries.length && (
                  <tr>
                    <td colSpan={7}>{deliveriesError ? "—" : t("pantry.emptyDeliveries")}</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </>
      )}

      {showCreate && (
        <div className="pantry-modal" role="dialog">
          <form className="pantry-modal__card pantry-modal__card--wide" onSubmit={createRequest}>
            <h2>{t("pantry.create.title")}</h2>
            <p className="muted">{t("pantry.create.subtitle")}</p>

            <section className="pantry-form-section">
              <h3>{t("pantry.create.serviceSection")}</h3>
              <label>
                {t("pantry.create.category")}
                <select
                  value={form.categoryId}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, categoryId: e.target.value, subSubcategoryId: "" }))
                  }
                >
                  <option value="">{t("pantry.create.chooseCategory")}</option>
                  {categoryOptions.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.label}
                    </option>
                  ))}
                </select>
                {fieldErrors.categoryId && <span className="pantry-field-error">{fieldErrors.categoryId}</span>}
              </label>
              <label>
                {t("pantry.create.subCategory")}
                <select
                  value={form.subSubcategoryId}
                  onChange={(e) => setForm((f) => ({ ...f, subSubcategoryId: e.target.value }))}
                  disabled={!form.categoryId}
                >
                  <option value="">{t("pantry.create.none")}</option>
                  {subSubs.map((ss) => (
                    <option key={ss.id} value={ss.id}>
                      {ss.nameAr || ss.name_ar || ss.name || `#${ss.id}`}
                    </option>
                  ))}
                </select>
              </label>
            </section>

            <section className="pantry-form-section">
              <h3>{t("pantry.create.detailsSection")}</h3>
              <label>
                {t("pantry.create.orderTitle")}
                <input
                  value={form.title}
                  onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
                />
                {fieldErrors.title && <span className="pantry-field-error">{fieldErrors.title}</span>}
              </label>
              <label>
                {t("pantry.create.description")}
                <textarea
                  rows={4}
                  value={form.description}
                  onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
                />
                {fieldErrors.description && (
                  <span className="pantry-field-error">{fieldErrors.description}</span>
                )}
              </label>
              <label>
                {t("pantry.create.skills")}
                <input
                  value={form.skillsText}
                  onChange={(e) => setForm((f) => ({ ...f, skillsText: e.target.value }))}
                  placeholder={t("pantry.create.skillsPh")}
                />
              </label>
              <label>
                {t("pantry.create.requirements")}
                <textarea
                  rows={3}
                  value={form.requirements}
                  onChange={(e) => setForm((f) => ({ ...f, requirements: e.target.value }))}
                />
              </label>
              <div className="pantry-form-row">
                <label>
                  {t("pantry.create.attachmentUrl")}
                  <input
                    value={form.attachmentUrl}
                    onChange={(e) => setForm((f) => ({ ...f, attachmentUrl: e.target.value }))}
                    placeholder="https://..."
                  />
                </label>
                <label>
                  {t("pantry.create.attachmentName")}
                  <input
                    value={form.attachmentName}
                    onChange={(e) => setForm((f) => ({ ...f, attachmentName: e.target.value }))}
                  />
                </label>
              </div>
            </section>

            <section className="pantry-form-section">
              <h3>{t("pantry.create.budgetSection")}</h3>
              <div className="pantry-type-row">
                <button
                  type="button"
                  className={form.pricingType === "fixed" ? "is-active" : ""}
                  onClick={() => setForm((f) => ({ ...f, pricingType: "fixed" }))}
                >
                  {t("pantry.create.fixedBudget")}
                </button>
                <button
                  type="button"
                  className={form.pricingType === "bidding" ? "is-active" : ""}
                  onClick={() => setForm((f) => ({ ...f, pricingType: "bidding" }))}
                >
                  {t("pantry.create.acceptBids")}
                </button>
              </div>
              {form.pricingType === "fixed" ? (
                <label>
                  {t("pantry.create.fixedBudgetLabel")}
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={form.fixedBudget}
                    onChange={(e) => setForm((f) => ({ ...f, fixedBudget: e.target.value }))}
                  />
                  {fieldErrors.fixedBudget && (
                    <span className="pantry-field-error">{fieldErrors.fixedBudget}</span>
                  )}
                </label>
              ) : (
                <div className="pantry-form-row">
                  <label>
                    {t("pantry.create.budgetMin")}
                    <input
                      type="number"
                      min="0"
                      step="0.01"
                      value={form.budgetMin}
                      onChange={(e) => setForm((f) => ({ ...f, budgetMin: e.target.value }))}
                    />
                    {fieldErrors.budgetMin && (
                      <span className="pantry-field-error">{fieldErrors.budgetMin}</span>
                    )}
                  </label>
                  <label>
                    {t("pantry.create.budgetMax")}
                    <input
                      type="number"
                      min="0"
                      step="0.01"
                      value={form.budgetMax}
                      onChange={(e) => setForm((f) => ({ ...f, budgetMax: e.target.value }))}
                    />
                    {fieldErrors.budgetMax && (
                      <span className="pantry-field-error">{fieldErrors.budgetMax}</span>
                    )}
                  </label>
                </div>
              )}
              <label>
                {t("pantry.create.deliveryDays")}
                <input
                  type="number"
                  min="1"
                  step="1"
                  value={form.deliveryDays}
                  onChange={(e) => setForm((f) => ({ ...f, deliveryDays: e.target.value }))}
                />
                {fieldErrors.deliveryDays && (
                  <span className="pantry-field-error">{fieldErrors.deliveryDays}</span>
                )}
              </label>
            </section>

            {integrationActive ? (
            <section className="pantry-form-section">
              <h3>{t("pantry.create.applicationSection")}</h3>
              <div className="pantry-form-row">
                <label>
                  {t("pantry.create.applicationCost")}
                  <input
                    type="number"
                    min="1"
                    step="1"
                    value={form.applicationBidCost}
                    onChange={(e) => setForm((f) => ({ ...f, applicationBidCost: e.target.value }))}
                  />
                </label>
                <label>
                  {t("pantry.create.targetApplicants")}
                  <input
                    type="number"
                    min="1"
                    step="1"
                    value={form.targetApplicantCount}
                    onChange={(e) => setForm((f) => ({ ...f, targetApplicantCount: e.target.value }))}
                    placeholder={t("pantry.create.optional")}
                  />
                </label>
              </div>
              <label>
                {t("pantry.create.applicationDeadline")}
                <input
                  type="datetime-local"
                  value={form.applicationDeadlineAt}
                  onChange={(e) => setForm((f) => ({ ...f, applicationDeadlineAt: e.target.value }))}
                />
              </label>
              <div>
                <span className="muted">{t("pantry.create.eligibleTiers")}</span>
                <div className="pantry-type-row">
                  {["starter", "silver", "pro", "elite"].map((code) => (
                    <label key={code} className="pantry-check">
                      <input
                        type="checkbox"
                        checked={Boolean(form.eligibleTiers?.[code])}
                        onChange={(e) =>
                          setForm((f) => ({
                            ...f,
                            eligibleTiers: { ...f.eligibleTiers, [code]: e.target.checked },
                          }))
                        }
                      />
                      {code.toUpperCase()}
                    </label>
                  ))}
                </div>
              </div>
            </section>
            ) : null}

            <section className="pantry-form-section">
              <h3>{t("pantry.create.minBidsSection")}</h3>
              <p className="muted">{t("pantry.create.minBidsHint")}</p>
              <label>
                {t("pantry.create.minBidsLabel")}
                <select
                  value={form.requiredBidCount}
                  onChange={(e) =>
                    setForm((f) => ({
                      ...f,
                      requiredBidCount: e.target.value,
                      minRequiredBidsAcknowledged: e.target.value === "" ? false : f.minRequiredBidsAcknowledged,
                    }))
                  }
                >
                  <option value="">{t("pantry.create.noMinBids")}</option>
                  {ARTICLE_ALLOWED_REQUIRED_BID_COUNTS.map((n) => (
                    <option key={n} value={String(n)}>
                      {n}
                    </option>
                  ))}
                </select>
              </label>
              {form.requiredBidCount !== "" ? (
                <>
                  <p className="pantry-field-error" role="note">
                    {t("pantry.create.minBidsWarning")}
                  </p>
                  <label className="pantry-check">
                    <input
                      type="checkbox"
                      checked={form.minRequiredBidsAcknowledged}
                      onChange={(e) =>
                        setForm((f) => ({ ...f, minRequiredBidsAcknowledged: e.target.checked }))
                      }
                    />
                    {t("pantry.create.minBidsAck")}
                  </label>
                </>
              ) : null}
            </section>

            <section className="pantry-form-section">
              <h3>{t("pantry.create.internalSection")}</h3>
              <label>
                {t("pantry.create.internalLabel")}
                <textarea
                  rows={2}
                  value={form.internalNotes}
                  onChange={(e) => setForm((f) => ({ ...f, internalNotes: e.target.value }))}
                />
              </label>
            </section>

            <section className="pantry-form-section">
              <h3>{t("pantry.create.publishSection")}</h3>
              <label className="pantry-check">
                <input
                  type="checkbox"
                  checked={form.publish}
                  onChange={(e) => setForm((f) => ({ ...f, publish: e.target.checked }))}
                />
                {t("pantry.create.publishNow")}
              </label>
            </section>

            <div className="pantry-actions">
              <button type="submit" className="btn btn-primary" disabled={saving}>
                {saving ? t("pantry.create.saving") : t("pantry.create.save")}
              </button>
              <button
                type="button"
                className="btn btn-secondary"
                onClick={() => {
                  setShowCreate(false);
                  setFieldErrors({});
                }}
              >
                {t("pantry.create.cancel")}
              </button>
            </div>
          </form>
        </div>
      )}

      {detail?.request && (
        <div className="pantry-modal" role="dialog">
          <div className="pantry-modal__card pantry-modal__card--wide">
            <h2>{detail.request.title}</h2>
            <p>{detail.request.description}</p>
            <p className="muted">
              {t("pantry.detail.typeLine", {
                type:
                  detail.request.pricingType === "bidding"
                    ? t("pantry.pricingType.biddingLong")
                    : t("pantry.pricingType.fixedLong"),
                duration:
                  detail.request.deliveryDays != null
                    ? t("pantry.detail.durationPart", { days: detail.request.deliveryDays })
                    : "",
                skills: detail.request.skills?.length
                  ? t("pantry.detail.skillsPart", {
                      skills: detail.request.skills.join(locale === "en" ? ", " : "، "),
                    })
                  : "",
              })}
            </p>
            {detail.request.requirements && <p className="muted">{t("pantry.detail.requirements", { text: detail.request.requirements })}</p>}
            <p>
              {t("pantry.detail.statusLine")} <strong>{statusLabels[detail.request.status] || detail.request.status}</strong>
            </p>
            {detail.request.bidCollection ? (
              <p>
                <strong>
                  {formatArticleBidCollectionLabel(detail.request.bidCollection, {
                    current: detail.request.bidCollection.currentBidCount,
                    required: detail.request.bidCollection.requiredBidCount,
                  })}
                </strong>
              </p>
            ) : null}
            {canRelistBidCollection(detail.request.bidCollection) ? (
              <div data-testid="pantry-relist-bid-collection">
                <p className="muted">{t("pantry.detail.relistNote")}</p>
                <button type="button" className="btn-primary" onClick={relistBidCollection} disabled={relisting}>
                  {t("pantry.detail.relistBtn")}
                </button>
              </div>
            ) : null}
            {integrationActive ? (
            <p className="muted">
              {t("pantry.detail.applicationCostLine", { cost: detail.request.applicationBidCost ?? 1 })}
              {detail.request.targetApplicantCount != null
                ? t("pantry.detail.applicantCap", {
                    current: detail.request.validApplicantCount ?? 0,
                    target: detail.request.targetApplicantCount,
                  })
                : t("pantry.detail.applicants", {
                    count: detail.request.validApplicantCount ?? detail.bids?.length ?? 0,
                  })}
              {detail.request.remainingApplicantSlots != null
                ? t("pantry.detail.remainingSlots", { count: detail.request.remainingApplicantSlots })
                : ""}
            </p>
            ) : null}
            {integrationActive && !!detail.request.eligibleTierCodes?.length && (
              <p className="muted">
                {t("pantry.detail.eligibleTiers", {
                  tiers: detail.request.eligibleTierCodes
                    .map((code) => String(code).toUpperCase())
                    .join(locale === "en" ? ", " : "، "),
                })}
              </p>
            )}
            {detail.request.requiredBidCount != null ? (
              <section className="pantry-form-section" data-testid="pantry-fair-ranking">
                <h3>{t("pantry.detail.fairRankingTitle")}</h3>
                {!isFairRankingEligible(detail.fairRanking) ? (
                  <p className="muted">
                    {(locale === "en"
                      ? detail.fairRanking?.messageEn
                      : detail.fairRanking?.messageAr) || t("pantry.detail.fairRankingPending")}
                  </p>
                ) : (
                  <>
                    <p className="muted">{t("pantry.detail.fairRankingDisclaimer")}</p>
                    <ol className="pantry-bid-list">
                      {(detail.fairRanking?.candidates || []).map((c) => (
                        <li key={c.bidId}>
                          <div>
                            <strong>
                              #{c.rank} {c.freelancerName || c.freelancerUserId}
                              {isRecommendedPantryBid(c.bidId, detail.fairRanking)
                                ? t("pantry.detail.topCandidate")
                                : ""}
                            </strong>
                            {c.amount != null ? ` — ${c.amount}` : ""}
                            <div className="muted">
                              {c.submittedAt ? new Date(c.submittedAt).toLocaleString() : ""}
                              {c.rankingReason ? ` · ${c.rankingReason}` : ""}
                            </div>
                          </div>
                        </li>
                      ))}
                    </ol>
                  </>
                )}
              </section>
            ) : null}
            <h3>{t("pantry.detail.bidsTitle")}</h3>
            <ul className="pantry-bid-list">
              {(detail.bids || []).map((b) => (
                <li key={b.id}>
                  <div>
                    <strong>{b.freelancerName || b.freelancerId}</strong> — {b.amount}
                    {b.durationDays ? ` / ${b.durationDays}${t("pantry.detail.dayUnit")}` : ""}
                    <div className="muted">{b.message || ""}</div>
                    <span className="muted">{b.status}</span>
                  </div>
                  {b.status === "pending" && detail.request.status === "open_for_bids" && (
                    <div className="pantry-actions">
                      <button
                        type="button"
                        className="btn btn-primary btn-sm"
                        disabled={
                          detail.request.requiredBidCount != null &&
                          !canSelectArticleApplicant(detail.request.bidCollection)
                        }
                        title={
                          detail.request.requiredBidCount != null &&
                          !canSelectArticleApplicant(detail.request.bidCollection)
                            ? t("pantry.detail.cannotAssignMinBids")
                            : undefined
                        }
                        onClick={() => onAcceptBid(b.id)}
                      >
                        {t("pantry.detail.acceptBid")}
                      </button>
                      <button type="button" className="btn btn-secondary btn-sm" onClick={() => onRejectBid(b.id)}>
                        {t("pantry.detail.rejectBid")}
                      </button>
                    </div>
                  )}
                </li>
              ))}
              {!detail.bids?.length && <li>{t("pantry.detail.noBids")}</li>}
            </ul>
            <h3>{t("pantry.detail.deliveriesTitle")}</h3>
            <ul className="pantry-bid-list">
              {(detail.deliveries || []).map((d) => (
                <li key={d.id}>
                  <div>
                    {statusLabels[d.status] || d.status}
                    <div className="muted">{d.message}</div>
                    {(d.files || []).map((f) => (
                      <div key={f.id}>
                        <a href={f.fileUrl} target="_blank" rel="noreferrer">
                          {f.fileName}
                        </a>
                      </div>
                    ))}
                  </div>
                  {d.status === "submitted" && (
                    <div className="pantry-actions">
                      <button type="button" className="btn btn-primary btn-sm" onClick={() => onApproveDelivery(d.id)}>
                        {t("pantry.approveDelivery")}
                      </button>
                      <button type="button" className="btn btn-secondary btn-sm" onClick={() => onRequestRevision(d.id)}>
                        {t("pantry.requestRevision")}
                      </button>
                    </div>
                  )}
                </li>
              ))}
              {!detail.deliveries?.length && <li>{t("pantry.detail.noDeliveries")}</li>}
            </ul>
            <button
              type="button"
              className="btn btn-secondary"
              onClick={() => {
                setDetail(null);
                setSelectedId(null);
              }}
            >
              {t("pantry.detail.close")}
            </button>
          </div>
        </div>
      )}
      <FairSelectionOverrideDialog
        open={Boolean(overrideBidId)}
        submitting={false}
        onCancel={() => setOverrideBidId(null)}
        onConfirm={async (reason) => {
          const id = overrideBidId;
          setOverrideBidId(null);
          await onAcceptBid(id, reason);
        }}
      />
    </div>
  );
}
