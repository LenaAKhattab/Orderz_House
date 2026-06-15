import { useEffect, useMemo, useState } from "react";
import {
  Calendar,
  CircleCheck,
  FileText,
  Files,
  FolderOpen,
  Hourglass,
  Inbox,
  Plus,
  Wallet,
  X,
} from "lucide-react";
import {
  createPortalFinancialClaimRequest,
  getCategoriesRequest,
  listPortalDoneProjectsRequest,
  listPortalFinancialClaimsRequest,
} from "../../services/api";
import { useToast } from "../../components/ui/toastContext";
import { useTranslation } from "../../i18n/LanguageProvider";
import DashboardHubPage from "../../components/dashboard/hub/DashboardHubPage";
import HubMetricSkeleton from "../../components/dashboard/hub/HubMetricSkeleton";
import "../../styles/dashboardHub.css";
import "./freelancerFinancialClaims.css";

function formatDate(value, locale, emDash) {
  if (!value) return emDash;
  const d = new Date(value);
  if (!Number.isFinite(d.getTime())) return emDash;
  const tag = locale === "ar" ? "ar-JO-u-nu-latn" : "en-GB";
  return new Intl.DateTimeFormat(tag, { dateStyle: "medium" }).format(d);
}

function formatMoney(value, emDash) {
  if (value === null || value === undefined || Number.isNaN(Number(value))) return emDash;
  return new Intl.NumberFormat("en-US", { maximumFractionDigits: 2 }).format(Number(value));
}

function payoutWindowText(claim, locale, emDash) {
  if (!claim?.actualCompletionDate) return emDash;
  const d = new Date(claim.actualCompletionDate);
  if (!Number.isFinite(d.getTime())) return emDash;
  const y = d.getUTCFullYear();
  const m = d.getUTCMonth() + 1;
  const ny = m === 12 ? y + 1 : y;
  const nm = m === 12 ? 1 : m + 1;
  const start = new Date(Date.UTC(ny, nm - 1, 1));
  const end = new Date(Date.UTC(ny, nm - 1, 10));
  return `${formatDate(start, locale, emDash)} → ${formatDate(end, locale, emDash)}`;
}

function claimGroupTitle(key, t) {
  const map = {
    under_review: "freelancerDashboard.financialClaims.groups.underReview",
    not_due: "freelancerDashboard.financialClaims.groups.notDue",
    due: "freelancerDashboard.financialClaims.groups.due",
    paid: "freelancerDashboard.financialClaims.groups.paid",
    blocked: "freelancerDashboard.financialClaims.groups.blocked",
  };
  return t(map[key] || map.blocked);
}

function mapStatusLabel(status, t, emDash) {
  const s = String(status || "");
  const map = {
    pending: "freelancerDashboard.status.claim.pending",
    accepted: "freelancerDashboard.status.claim.accepted",
    rejected: "freelancerDashboard.status.claim.rejected",
    frozen: "freelancerDashboard.status.claim.frozen",
    requires_in_person_review: "freelancerDashboard.status.claim.requiresInPersonReview",
    paid: "freelancerDashboard.status.claim.paid",
  };
  return map[s] ? t(map[s]) : s || emDash;
}

function statusBadgeClass(status) {
  const s = String(status || "");
  if (s === "paid") return "ffc-pill ffc-pill--success";
  if (s === "pending") return "ffc-pill ffc-pill--warning";
  if (s === "accepted") return "ffc-pill ffc-pill--info";
  if (["rejected", "frozen"].includes(s)) return "ffc-pill ffc-pill--danger";
  if (s === "requires_in_person_review") return "ffc-pill ffc-pill--muted";
  return "ffc-pill";
}

function StatSegment({ tone, Icon, value, label, loading }) {
  return (
    <div className={`ffc-stat-segment ffc-stat-segment--${tone}`}>
      <span className="ffc-stat-segment__icon" aria-hidden>
        <Icon size={20} strokeWidth={1.75} />
      </span>
      <div className="ffc-stat-segment__copy">
        <span className="ffc-stat-segment__label">{label}</span>
        {loading ? (
          <HubMetricSkeleton variant="stat" />
        ) : (
          <strong className="ffc-stat-segment__value">{value}</strong>
        )}
      </div>
    </div>
  );
}

function mapPayoutLabel(status, t, emDash) {
  const s = String(status || "");
  const map = {
    missing_completion_date: "freelancerDashboard.status.payout.missingCompletionDate",
    not_due_yet: "freelancerDashboard.status.payout.notDueYet",
    within_payout_window: "freelancerDashboard.status.payout.withinWindow",
    late_after_payout_window: "freelancerDashboard.status.payout.lateAfterWindow",
    paid: "freelancerDashboard.status.payout.paid",
  };
  return map[s] ? t(map[s]) : s || emDash;
}

function mapPaymentStatusLabel(status, t, emDash) {
  const s = String(status || "");
  const map = {
    paid: "freelancerDashboard.status.payment.paid",
    pending: "freelancerDashboard.status.payment.pending",
    unpaid: "freelancerDashboard.status.payment.unpaid",
    not_required: "freelancerDashboard.status.payment.notRequired",
    failed: "freelancerDashboard.status.payment.failed",
    refunded: "freelancerDashboard.status.payment.refunded",
    skipped_by_admin: "freelancerDashboard.status.payment.skippedByAdmin",
  };
  return map[s] ? t(map[s]) : s || emDash;
}

function groupClaims(claims) {
  const grouped = {
    under_review: [],
    not_due: [],
    due: [],
    paid: [],
    blocked: [],
  };
  for (const c of claims) {
    if (c.status === "pending") {
      grouped.under_review.push(c);
      continue;
    }
    if (["rejected", "frozen", "requires_in_person_review"].includes(c.status)) {
      grouped.blocked.push(c);
      continue;
    }
    if (c.status === "paid" || c.payoutStatus === "paid") {
      grouped.paid.push(c);
      continue;
    }
    if (c.payoutStatus === "not_due_yet" || c.payoutStatus === "missing_completion_date") {
      grouped.not_due.push(c);
      continue;
    }
    grouped.due.push(c);
  }
  return grouped;
}

function extractDoneProjects(responseData) {
  const fromProjects = responseData?.data?.projects;
  if (Array.isArray(fromProjects)) return fromProjects;
  const fromDoneProjects = responseData?.data?.doneProjects;
  if (Array.isArray(fromDoneProjects)) return fromDoneProjects;
  return [];
}

export default function FreelancerFinancialClaimsPage() {
  const { push } = useToast();
  const { t, locale, dir } = useTranslation();
  const emDash = t("freelancerDashboard.common.emDash");
  const fc = "freelancerDashboard.financialClaims";
  const [claims, setClaims] = useState([]);
  const [doneProjects, setDoneProjects] = useState([]);
  const [categories, setCategories] = useState([]);
  const [busy, setBusy] = useState(true);
  const [createOpen, setCreateOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [mode, setMode] = useState("manual");
  const [selectedProjectId, setSelectedProjectId] = useState("");
  const [searchDone, setSearchDone] = useState("");
  const [doneLoading, setDoneLoading] = useState(false);
  const [form, setForm] = useState({
    orderNumber: "",
    requestTitle: "",
    categoriesText: "",
    selectedCategoryIds: [],
    durationMinutes: "",
    actualCompletionDate: "",
  });

  const reload = async () => {
    setBusy(true);
    try {
      const [claimsRes, doneRes] = await Promise.all([
        listPortalFinancialClaimsRequest({}),
        listPortalDoneProjectsRequest({ q: searchDone, limit: 50 }),
      ]);
      setClaims(claimsRes?.data?.claims || []);
      setDoneProjects(extractDoneProjects(doneRes));
      const categoriesRes = await getCategoriesRequest();
      const categoryList = categoriesRes?.data?.categories || [];
      setCategories(Array.isArray(categoryList) ? categoryList : []);
    } catch (e) {
      push({
        type: "error",
        title: t(`${fc}.loadErrorTitle`),
        message: e?.response?.data?.message || e?.message,
      });
    } finally {
      setBusy(false);
    }
  };

  useEffect(() => {
    reload();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    let cancelled = false;
    async function loadDone() {
      setDoneLoading(true);
      try {
        const res = await listPortalDoneProjectsRequest({ q: searchDone, limit: 50 });
        if (!cancelled) setDoneProjects(extractDoneProjects(res));
      } catch {
        if (!cancelled) setDoneProjects([]);
      } finally {
        if (!cancelled) setDoneLoading(false);
      }
    }
    loadDone();
    return () => {
      cancelled = true;
    };
  }, [searchDone]);

  const grouped = useMemo(() => groupClaims(claims), [claims]);

  const summary = useMemo(() => {
    let pending = 0;
    let paid = 0;
    for (const c of claims) {
      if (c.status === "pending") pending += 1;
      if (c.status === "paid" || c.payoutStatus === "paid") paid += 1;
    }
    return { total: claims.length, pending, paid };
  }, [claims]);

  const canSubmitClaim = useMemo(() => {
    if (submitting) return false;
    if (mode === "manual") {
      const hasOrderNumber = String(form.orderNumber || "").trim().length > 0;
      const hasTitle = String(form.requestTitle || "").trim().length > 0;
      const hasCategories = Array.isArray(form.selectedCategoryIds) && form.selectedCategoryIds.length > 0;
      const hasDuration = String(form.durationMinutes || "").trim().length > 0 && Number(form.durationMinutes) >= 0;
      const hasCompletionDate = String(form.actualCompletionDate || "").trim().length > 0;
      return hasOrderNumber && hasTitle && hasCategories && hasDuration && hasCompletionDate;
    }
    const hasProject = String(selectedProjectId || "").trim().length > 0;
    const hasAutoOrderNumber = String(form.orderNumber || "").trim().length > 0;
    const hasAutoTitle = String(form.requestTitle || "").trim().length > 0;
    const hasAutoCategories = String(form.categoriesText || "").trim().length > 0;
    const hasCompletionDate = String(form.actualCompletionDate || "").trim().length > 0;
    return hasProject && hasAutoOrderNumber && hasAutoTitle && hasAutoCategories && hasCompletionDate;
  }, [submitting, mode, form, selectedProjectId]);

  useEffect(() => {
    if (mode !== "done_project") return;
    const project = doneProjects.find((p) => String(p.projectId) === String(selectedProjectId));
    if (!project) return;
    setForm((prev) => ({
      ...prev,
      orderNumber: project.orderNumber || "",
      requestTitle: project.requestTitle || "",
      categoriesText: Array.isArray(project.categories) ? project.categories.join("، ") : "",
      durationMinutes:
        Number(project.durationMinutes) > 0 ? String(project.durationMinutes) : prev.durationMinutes || "",
      actualCompletionDate: project.actualCompletionDate || "",
    }));
  }, [mode, selectedProjectId, doneProjects]);

  const createClaim = async () => {
    setSubmitting(true);
    try {
      const payload =
        mode === "manual"
          ? {
              mode: "manual",
              orderNumber: form.orderNumber,
              requestTitle: form.requestTitle,
              categories: (form.selectedCategoryIds || [])
                .map((id) => categories.find((c) => String(c.id) === String(id))?.name)
                .filter(Boolean),
              durationMinutes: form.durationMinutes === "" ? 0 : Number(form.durationMinutes),
              actualCompletionDate: form.actualCompletionDate,
            }
          : {
              mode: "done_project",
              projectId: Number(selectedProjectId),
              durationMinutes: form.durationMinutes === "" ? null : Number(form.durationMinutes),
              actualCompletionDate: form.actualCompletionDate || null,
            };
      await createPortalFinancialClaimRequest(payload);
      push({
        type: "success",
        title: t(`${fc}.createSuccessTitle`),
        message: t(`${fc}.createSuccessMessage`),
      });
      setCreateOpen(false);
      setSelectedProjectId("");
      setForm({
        orderNumber: "",
        requestTitle: "",
        categoriesText: "",
        selectedCategoryIds: [],
        durationMinutes: "",
        actualCompletionDate: "",
      });
      await reload();
    } catch (e) {
      push({
        type: "error",
        title: t(`${fc}.createErrorTitle`),
        message: e?.response?.data?.message || e?.message,
      });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <DashboardHubPage className="fdash-page--financial-claims">
      <header className="ffc-surface ffc-header">
        <div className="ffc-header__copy">
          <h1 className="ffc-header__title">{t(`${fc}.title`)}</h1>
          <p className="ffc-header__subtitle">{t(`${fc}.subtitle`)}</p>
        </div>
        <div className="ffc-header__art">
          <span className="ffc-header__icon-chip" aria-hidden>
            <Wallet size={32} strokeWidth={1.85} />
          </span>
          <button type="button" className="ffc-header__cta" onClick={() => setCreateOpen(true)}>
            <Plus size={16} strokeWidth={2.2} aria-hidden />
            <span>{t(`${fc}.newClaim`)}</span>
          </button>
        </div>
      </header>

      <div className="ffc-surface ffc-stats-bar" aria-label={t("freelancerDashboard.stats.financialClaims.summaryAria")}>
        <StatSegment
          tone="slate"
          Icon={Files}
          value={summary.total}
          label={t("freelancerDashboard.stats.financialClaims.total")}
          loading={busy}
        />
        <StatSegment
          tone="amber"
          Icon={Hourglass}
          value={summary.pending}
          label={t("freelancerDashboard.stats.financialClaims.underReview")}
          loading={busy}
        />
        <StatSegment
          tone="emerald"
          Icon={CircleCheck}
          value={summary.paid}
          label={t("freelancerDashboard.stats.financialClaims.paid")}
          loading={busy}
        />
      </div>

      {busy ? (
        <section className="ffc-surface ffc-content" aria-busy="true">
          <p className="ffc-loading">{t(`${fc}.loading`)}</p>
        </section>
      ) : claims.length === 0 ? (
        <section className="ffc-surface ffc-content">
          <div className="ffc-empty">
            <span className="ffc-empty__icon-chip" aria-hidden>
              <Inbox size={36} strokeWidth={1.6} />
            </span>
            <h2 className="ffc-empty__title">{t(`${fc}.emptyTitle`)}</h2>
            <p className="ffc-empty__sub">{t(`${fc}.emptySub`)}</p>
            <button type="button" className="ffc-empty__cta" onClick={() => setCreateOpen(true)}>
              <Plus size={16} strokeWidth={2.2} aria-hidden />
              <span>{t(`${fc}.newClaim`)}</span>
            </button>
          </div>
        </section>
      ) : (
        <div className="ffc-groups">
          {Object.entries(grouped).map(([groupKey, items]) => (
            <section key={groupKey} className="ffc-surface ffc-group">
              <div className="ffc-group__head">
                <h2 className="ffc-group__title">
                  {claimGroupTitle(groupKey, t)} <span className="ffc-group__count">({items.length})</span>
                </h2>
              </div>
              <div className="ffc-group__body">
                {items.length === 0 ? (
                  <p className="ffc-group__empty">{t(`${fc}.groupEmpty`)}</p>
                ) : (
                  <div className="ffc-claims-grid">
                    {items.map((claim) => (
                      <article key={claim.id} className="ffc-claim-card">
                        <div className="ffc-claim-card__head">
                          <h3 className="ffc-claim-card__title">{claim.requestTitle || emDash}</h3>
                          <span className={statusBadgeClass(claim.status)}>
                            {mapStatusLabel(claim.status, t, emDash)}
                          </span>
                        </div>
                        <dl className="ffc-dl">
                          <div className="ffc-dl-row">
                            <dt>{t(`${fc}.fields.orderNumber`)}</dt>
                            <dd dir="ltr">{claim.orderNumber || emDash}</dd>
                          </div>
                          <div className="ffc-dl-row">
                            <dt>{t(`${fc}.fields.completionDate`)}</dt>
                            <dd>{formatDate(claim.actualCompletionDate, locale, emDash)}</dd>
                          </div>
                          <div className="ffc-dl-row">
                            <dt>{t(`${fc}.fields.submittedAt`)}</dt>
                            <dd>{formatDate(claim.submittedAt, locale, emDash)}</dd>
                          </div>
                          <div className="ffc-dl-row">
                            <dt>{t(`${fc}.fields.payoutWindow`)}</dt>
                            <dd>{payoutWindowText(claim, locale, emDash)}</dd>
                          </div>
                          <div className="ffc-dl-row">
                            <dt>{t(`${fc}.fields.payoutStatus`)}</dt>
                            <dd>{mapPayoutLabel(claim.payoutStatus, t, emDash)}</dd>
                          </div>
                          <div className="ffc-dl-row ffc-dl-row--money">
                            <dt>{t(`${fc}.fields.totalPrice`)}</dt>
                            <dd dir="ltr">{formatMoney(claim.totalPriceSnapshot, emDash)}</dd>
                          </div>
                          <div className="ffc-dl-row ffc-dl-row--money">
                            <dt>{t(`${fc}.fields.freelancerAmount`)}</dt>
                            <dd dir="ltr">{formatMoney(claim.userAmountSnapshot, emDash)}</dd>
                          </div>
                          <div className="ffc-dl-row ffc-dl-row--money">
                            <dt>{t(`${fc}.fields.paid`)}</dt>
                            <dd dir="ltr">{formatMoney(claim.paidAmount, emDash)}</dd>
                          </div>
                          <div className="ffc-dl-row ffc-dl-row--money">
                            <dt>{t(`${fc}.fields.remaining`)}</dt>
                            <dd dir="ltr">{formatMoney(claim.remainingAmount, emDash)}</dd>
                          </div>
                        </dl>
                        {claim.adminNote ? (
                          <div className="ffc-claim-card__note">
                            <strong>{t(`${fc}.fields.adminNote`)}</strong> {claim.adminNote}
                          </div>
                        ) : null}
                      </article>
                    ))}
                  </div>
                )}
              </div>
            </section>
          ))}
        </div>
      )}

      {createOpen ? (
        <div className="ffc-claim-modal-overlay" role="dialog" aria-modal="true" aria-labelledby="ffc-claim-modal-title">
          <div className="ffc-claim-modal" dir={dir} onMouseDown={(e) => e.stopPropagation()}>
            <button
              type="button"
              className="ffc-claim-modal__close"
              onClick={() => setCreateOpen(false)}
              aria-label={t(`${fc}.modal.close`)}
            >
              <X size={18} strokeWidth={1.75} aria-hidden />
            </button>

            <header className="ffc-claim-modal__hero">
              <span className="ffc-claim-modal__hero-icon" aria-hidden>
                <FileText size={22} strokeWidth={1.5} />
              </span>
              <h2 id="ffc-claim-modal-title" className="ffc-claim-modal__title">
                {t(`${fc}.modal.title`)}
              </h2>
              <p className="ffc-claim-modal__subtitle">{t(`${fc}.modal.subtitle`)}</p>
            </header>

            <div className="ffc-claim-modal__body">
              <div className="ffc-claim-modal__mode" role="tablist" aria-label={t(`${fc}.modal.modeAria`)}>
                <button
                  type="button"
                  role="tab"
                  aria-selected={mode === "done_project"}
                  className={`ffc-claim-modal__mode-btn${mode === "done_project" ? " is-active" : ""}`}
                  onClick={() => setMode("done_project")}
                >
                  {mode === "done_project" ? <Plus size={14} strokeWidth={2} aria-hidden /> : null}
                  <FolderOpen size={15} strokeWidth={1.5} aria-hidden />
                  <span>{t(`${fc}.modal.fromDoneProject`)}</span>
                </button>
                <button
                  type="button"
                  role="tab"
                  aria-selected={mode === "manual"}
                  className={`ffc-claim-modal__mode-btn${mode === "manual" ? " is-active" : ""}`}
                  onClick={() => setMode("manual")}
                >
                  {mode === "manual" ? <Plus size={14} strokeWidth={2} aria-hidden /> : null}
                  <Calendar size={15} strokeWidth={1.5} aria-hidden />
                  <span>{t(`${fc}.modal.manual`)}</span>
                </button>
              </div>

              {doneLoading && mode === "done_project" ? (
                <div className="ffc-claim-modal__skeleton" aria-hidden>
                  <span className="ffc-claim-modal__sk-line ffc-claim-modal__sk-line--sm" />
                  <span className="ffc-claim-modal__sk-field" />
                  <span className="ffc-claim-modal__sk-line ffc-claim-modal__sk-line--sm" />
                  <span className="ffc-claim-modal__sk-field" />
                  <span className="ffc-claim-modal__sk-line ffc-claim-modal__sk-line--sm" />
                  <span className="ffc-claim-modal__sk-field" />
                </div>
              ) : (
                <div className="ffc-claim-modal__form">
                  {mode === "done_project" ? (
                    <>
                      <label className="ffc-claim-field">
                        <span className="ffc-claim-field__label">{t(`${fc}.modal.searchDoneProjects`)}</span>
                        <input
                          className="ffc-claim-field__input"
                          value={searchDone}
                          onChange={(e) => setSearchDone(e.target.value)}
                          placeholder={t(`${fc}.modal.searchPlaceholder`)}
                        />
                      </label>
                      <label className="ffc-claim-field">
                        <span className="ffc-claim-field__label">{t(`${fc}.modal.selectProject`)}</span>
                        <select
                          className="ffc-claim-field__input ffc-claim-field__select"
                          value={selectedProjectId}
                          onChange={(e) => setSelectedProjectId(e.target.value)}
                        >
                          <option value="">{t(`${fc}.modal.selectProjectPlaceholder`)}</option>
                          {doneProjects.map((p) => (
                            <option key={p.projectId} value={p.projectId}>
                              {(p.orderNumber || `#${p.projectId}`) +
                                " — " +
                                (p.requestTitle || t(`${fc}.modal.noTitle`))}
                            </option>
                          ))}
                        </select>
                      </label>
                      {selectedProjectId ? (
                        (() => {
                          const p = doneProjects.find((x) => String(x.projectId) === String(selectedProjectId));
                          if (!p) return null;
                          return (
                            <p className="ffc-claim-modal__hint">
                              {p.hasMissingCompletionDate
                                ? t(`${fc}.modal.missingCompletionDate`)
                                : t(`${fc}.modal.projectHint`, {
                                    date: formatDate(p.actualCompletionDate, locale, emDash),
                                    status: p.orderStatus,
                                  })}
                              <br />
                              {t(`${fc}.modal.projectMeta`, {
                                source: p.sourceType || emDash,
                                payment: mapPaymentStatusLabel(p.paymentStatus, t, emDash),
                                amount:
                                  p.totalPriceSnapshot != null ? formatMoney(p.totalPriceSnapshot, emDash) : emDash,
                                currency: p.currencyCode ? ` ${p.currencyCode}` : "",
                              })}
                            </p>
                          );
                        })()
                      ) : null}
                    </>
                  ) : null}

                  {mode === "manual" ? (
                    <label className="ffc-claim-field">
                      <span className="ffc-claim-field__label">{t(`${fc}.modal.orderNumber`)}</span>
                      <input
                        className="ffc-claim-field__input"
                        value={form.orderNumber}
                        onChange={(e) => setForm((p) => ({ ...p, orderNumber: e.target.value }))}
                        placeholder={t(`${fc}.modal.orderNumberPlaceholder`)}
                      />
                    </label>
                  ) : (
                    <label className="ffc-claim-field">
                      <span className="ffc-claim-field__label">{t(`${fc}.modal.orderNumber`)}</span>
                      <input className="ffc-claim-field__input" value={form.orderNumber || emDash} readOnly disabled />
                    </label>
                  )}

                  {mode === "manual" ? (
                    <>
                      <label className="ffc-claim-field">
                        <span className="ffc-claim-field__label">{t(`${fc}.modal.requestTitle`)}</span>
                        <input
                          className="ffc-claim-field__input"
                          value={form.requestTitle}
                          onChange={(e) => setForm((p) => ({ ...p, requestTitle: e.target.value }))}
                          placeholder={t(`${fc}.modal.requestTitlePlaceholder`)}
                        />
                      </label>
                      <div className="ffc-claim-field">
                        <span className="ffc-claim-field__label">{t(`${fc}.modal.categories`)}</span>
                        <div className="ffc-claim-modal__categories">
                          {categories.length === 0 ? (
                            <p className="ffc-claim-modal__hint">{t(`${fc}.modal.noCategories`)}</p>
                          ) : (
                            categories.map((cat) => {
                              const checked = (form.selectedCategoryIds || []).includes(String(cat.id));
                              return (
                                <label key={String(cat.id)} className="ffc-claim-modal__category">
                                  <input
                                    type="checkbox"
                                    checked={checked}
                                    onChange={(e) => {
                                      setForm((p) => {
                                        const current = Array.isArray(p.selectedCategoryIds)
                                          ? p.selectedCategoryIds
                                          : [];
                                        const next = e.target.checked
                                          ? Array.from(new Set([...current, String(cat.id)]))
                                          : current.filter((x) => String(x) !== String(cat.id));
                                        return { ...p, selectedCategoryIds: next };
                                      });
                                    }}
                                  />
                                  <span>{cat.name}</span>
                                </label>
                              );
                            })
                          )}
                        </div>
                      </div>
                      <label className="ffc-claim-field">
                        <span className="ffc-claim-field__label">{t(`${fc}.modal.durationMinutes`)}</span>
                        <input
                          className="ffc-claim-field__input"
                          type="number"
                          min="0"
                          value={form.durationMinutes}
                          onChange={(e) => setForm((p) => ({ ...p, durationMinutes: e.target.value }))}
                          placeholder="0"
                        />
                      </label>
                      <label className="ffc-claim-field">
                        <span className="ffc-claim-field__label">{t(`${fc}.modal.completionDate`)}</span>
                        <input
                          className="ffc-claim-field__input"
                          type="date"
                          value={form.actualCompletionDate}
                          onChange={(e) => setForm((p) => ({ ...p, actualCompletionDate: e.target.value }))}
                        />
                      </label>
                    </>
                  ) : (
                    <>
                      <label className="ffc-claim-field">
                        <span className="ffc-claim-field__label">{t(`${fc}.modal.requestTitleFromProject`)}</span>
                        <input className="ffc-claim-field__input" value={form.requestTitle || emDash} readOnly disabled />
                      </label>
                      <label className="ffc-claim-field">
                        <span className="ffc-claim-field__label">{t(`${fc}.modal.categories`)}</span>
                        <input className="ffc-claim-field__input" value={form.categoriesText || emDash} readOnly disabled />
                      </label>
                      <label className="ffc-claim-field">
                        <span className="ffc-claim-field__label">{t(`${fc}.modal.durationMinutes`)}</span>
                        <input className="ffc-claim-field__input" value={form.durationMinutes || emDash} readOnly disabled />
                      </label>
                      <label className="ffc-claim-field">
                        <span className="ffc-claim-field__label">{t(`${fc}.modal.completionDate`)}</span>
                        <input
                          className="ffc-claim-field__input"
                          value={form.actualCompletionDate ? formatDate(form.actualCompletionDate, locale, emDash) : emDash}
                          readOnly
                          disabled
                        />
                      </label>
                    </>
                  )}
                </div>
              )}
            </div>

            <footer className="ffc-claim-modal__foot">
              <button
                type="button"
                className="ffc-claim-modal__btn ffc-claim-modal__btn--ghost"
                disabled={submitting}
                onClick={() => setCreateOpen(false)}
              >
                {t(`${fc}.modal.cancel`)}
              </button>
              <button
                type="button"
                className="ffc-claim-modal__btn ffc-claim-modal__btn--primary"
                disabled={!canSubmitClaim}
                onClick={createClaim}
              >
                {submitting ? t(`${fc}.modal.submitting`) : t(`${fc}.modal.submit`)}
              </button>
            </footer>
          </div>
        </div>
      ) : null}
    </DashboardHubPage>
  );
}
