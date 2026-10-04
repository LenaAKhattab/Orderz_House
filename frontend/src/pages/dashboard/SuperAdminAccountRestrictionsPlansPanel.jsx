import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { MoreVertical } from "lucide-react";
import Button from "../../components/ui/Button";
import DashboardEmptyState from "../../components/dashboard/DashboardEmptyState";
import DashboardLoadingState from "../../components/dashboard/DashboardLoadingState";
import DashboardErrorState from "../../components/dashboard/DashboardErrorState";
import StatusBadge from "../../components/dashboard/StatusBadge";
import ConfirmDialog from "../../components/dashboard/ConfirmDialog";
import { useToast } from "../../components/ui/toastContext";
import { useTranslation } from "../../i18n/LanguageProvider";
import { formatLocaleDate, formatLocaleDateTime } from "../../i18n/formatLocale";
import { presentServerMessage } from "../../i18n/presentServerMessage";
import {
  createSuperAdminPlanRestrictionRequest,
  extendSuperAdminPlanRestrictionRequest,
  getSuperAdminPlanRestrictionRequest,
  listSuperAdminPlanRestrictionsRequest,
  revokeSuperAdminPlanRestrictionRequest,
  updateSuperAdminPlanRestrictionRequest,
} from "../../services/api";

const CUSTOM_SCOPES = [
  "bids",
  "direct_claims",
  "order_assignments",
  "articles",
  "competitions",
  "messaging",
];

const DURATION_OPTIONS = [
  { id: "none", days: null },
  { id: "h24", ms: 24 * 3600 * 1000 },
  { id: "d3", ms: 3 * 24 * 3600 * 1000 },
  { id: "d7", ms: 7 * 24 * 3600 * 1000 },
  { id: "d30", ms: 30 * 24 * 3600 * 1000 },
  { id: "custom" },
];

function errorMessage(err, t, locale) {
  return presentServerMessage(err, t, locale);
}

function formatCount(value) {
  return Number(value || 0).toLocaleString("en-US");
}

function planStatusTone(status) {
  if (status === "ACTIVE") return "warning";
  if (status === "EXPIRED") return "inactive";
  if (status === "REVOKED") return "success";
  return "neutral";
}

function planStatusLabel(t, status) {
  const key = `accountRestrictions.plans.statusLabels.${status || "NONE"}`;
  const text = t(key);
  return text === key ? String(status || t("accountRestrictions.plans.notRestricted")) : text;
}

function scopeLabels(t, scopes) {
  const list = Array.isArray(scopes) ? scopes : [];
  if (!list.length || list.includes("ALL_MARKETPLACE")) {
    return [t("accountRestrictions.scopesLabels.ALL_MARKETPLACE")];
  }
  return list.map((s) => {
    const key = `accountRestrictions.scopesLabels.${s}`;
    const text = t(key);
    return text === key ? s : text;
  });
}

function expiresAtFromDuration(durationId, customValue) {
  if (durationId === "none") return null;
  if (durationId === "custom") {
    if (!customValue) return null;
    const d = new Date(customValue);
    return Number.isFinite(d.getTime()) ? d.toISOString() : null;
  }
  const opt = DURATION_OPTIONS.find((o) => o.id === durationId);
  if (!opt?.ms) return null;
  return new Date(Date.now() + opt.ms).toISOString();
}

function planDisplayName(row, locale) {
  return locale?.startsWith("en") ? row.planNameEn || row.tierCode : row.planNameAr || row.tierCode;
}

/** Exact Users row-action menu (portal + fixed panel). */
function RowActionsMenu({ open, onOpenChange, label, items }) {
  const triggerRef = useRef(null);
  const panelRef = useRef(null);
  const [pos, setPos] = useState(null);

  useEffect(() => {
    if (!open) {
      setPos(null);
      return undefined;
    }
    const update = () => {
      const el = triggerRef.current;
      if (!el) return;
      const r = el.getBoundingClientRect();
      const width = 188;
      const left = Math.min(Math.max(8, r.right - width), window.innerWidth - width - 8);
      setPos({ top: r.bottom + 6, left });
    };
    update();
    window.addEventListener("scroll", update, true);
    window.addEventListener("resize", update);
    return () => {
      window.removeEventListener("scroll", update, true);
      window.removeEventListener("resize", update);
    };
  }, [open]);

  useEffect(() => {
    if (!open) return undefined;
    const onDoc = (e) => {
      if (triggerRef.current?.contains(e.target) || panelRef.current?.contains(e.target)) return;
      onOpenChange(false);
    };
    const onKey = (e) => {
      if (e.key === "Escape") onOpenChange(false);
    };
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
    };
  }, [open, onOpenChange]);

  const panel =
    open && pos
      ? createPortal(
          <div ref={panelRef} className="oh-sa-users-row-menu__panel" role="menu" style={{ top: pos.top, left: pos.left }}>
            {items.map((item) => (
              <button
                key={item.key}
                type="button"
                role="menuitem"
                className={`oh-sa-users-row-menu__item${item.danger ? " oh-sa-users-row-menu__item--danger" : ""}`}
                onClick={() => {
                  onOpenChange(false);
                  item.onClick();
                }}
              >
                {item.label}
              </button>
            ))}
          </div>,
          document.body,
        )
      : null;

  return (
    <div className="oh-sa-users-row-menu">
      <button
        ref={triggerRef}
        type="button"
        className={`oh-sa-users-row-menu__trigger${open ? " is-open" : ""}`}
        aria-label={label}
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => onOpenChange(!open)}
      >
        <MoreVertical size={18} strokeWidth={2.25} aria-hidden />
      </button>
      {panel}
    </div>
  );
}

function ScopeModeField({ scopeMode, setScopeMode, scopes, onToggleCustomScope, busy, t }) {
  return (
    <fieldset className="oh-sa-users-field">
      <span>{t("accountRestrictions.scopes")}</span>
      <div className="oh-sa-restr-radio-row">
        <label className="oh-sa-restr-radio">
          <input
            type="radio"
            name="planScopeMode"
            checked={scopeMode === "all"}
            onChange={() => setScopeMode("all")}
            disabled={busy}
          />
          {t("accountRestrictions.scopeMode.all")}
        </label>
        <label className="oh-sa-restr-radio">
          <input
            type="radio"
            name="planScopeMode"
            checked={scopeMode === "custom"}
            onChange={() => setScopeMode("custom")}
            disabled={busy}
          />
          {t("accountRestrictions.scopeMode.custom")}
        </label>
      </div>
      {scopeMode === "custom" ? (
        <div className="oh-sa-restr-custom-scopes">
          {CUSTOM_SCOPES.map((scope) => (
            <label key={scope} className="oh-sa-restr-radio">
              <input
                type="checkbox"
                checked={(scopes || []).includes(scope)}
                onChange={() => onToggleCustomScope(scope)}
                disabled={busy}
              />
              {t(`accountRestrictions.scopesLabels.${scope}`)}
            </label>
          ))}
        </div>
      ) : null}
    </fieldset>
  );
}

function DurationField({ durationId, setDurationId, customExpires, setCustomExpires, busy, t, allowNone = true }) {
  const options = allowNone ? DURATION_OPTIONS : DURATION_OPTIONS.filter((o) => o.id !== "none");
  return (
    <>
      <label className="oh-sa-users-field">
        <span>{t("accountRestrictions.duration.label")}</span>
        <select value={durationId} onChange={(e) => setDurationId(e.target.value)} disabled={busy}>
          {options.map((opt) => (
            <option key={opt.id} value={opt.id}>
              {t(`accountRestrictions.duration.${opt.id}`)}
            </option>
          ))}
        </select>
      </label>
      {durationId === "custom" ? (
        <label className="oh-sa-users-field">
          <span>{t("accountRestrictions.columns.expiresAt")}</span>
          <input
            type="datetime-local"
            value={customExpires}
            onChange={(e) => setCustomExpires(e.target.value)}
            disabled={busy}
          />
        </label>
      ) : null}
    </>
  );
}

function PlanRestrictDrawer({
  open,
  onClose,
  busy,
  selectedPlan,
  setSelectedPlan,
  planChoices,
  form,
  setForm,
  scopeMode,
  setScopeMode,
  durationId,
  setDurationId,
  customExpires,
  setCustomExpires,
  onSubmit,
  locale,
  t,
}) {
  if (!open) return null;

  const toggleCustomScope = (scope) => {
    setForm((prev) => {
      const current = (prev.scopes || []).filter((s) => s !== "ALL_MARKETPLACE");
      const next = current.includes(scope) ? current.filter((s) => s !== scope) : [...current, scope];
      return { ...prev, scopes: next.length ? next : ["bids"] };
    });
  };

  const displayName = selectedPlan ? planDisplayName(selectedPlan, locale) : "";

  return (
    <div className="oh-sa-users-drawer" role="dialog" aria-modal="true" aria-labelledby="oh-sa-plan-restr-add-title">
      <button
        type="button"
        className="oh-sa-users-drawer__backdrop"
        aria-label={t("accountRestrictions.form.close")}
        onClick={busy ? undefined : onClose}
      />
      <aside className="oh-sa-users-drawer__panel">
        <header className="oh-sa-users-drawer__header">
          <div>
            <h2 id="oh-sa-plan-restr-add-title">{t("accountRestrictions.plans.restrictPlan")}</h2>
            {selectedPlan ? (
              <p className="oh-sa-users-drawer__sub">
                <span dir="ltr">{selectedPlan.tierCode}</span>
                {" · "}
                {displayName}
              </p>
            ) : (
              <p className="oh-sa-users-drawer__sub">{t("accountRestrictions.plans.selectPlan")}</p>
            )}
          </div>
          <button
            type="button"
            className="oh-sa-users-drawer__close"
            onClick={onClose}
            disabled={busy}
            aria-label={t("accountRestrictions.form.close")}
          >
            ×
          </button>
        </header>
        <div className="oh-sa-users-drawer__body">
          {!selectedPlan ? (
            <div className="oh-sa-users-stack">
              <label className="oh-sa-users-field">
                <span>{t("accountRestrictions.plans.selectPlan")}</span>
              </label>
              <div className="oh-sa-restr-search-results">
                {planChoices.map((p) => {
                  const name = planDisplayName(p, locale);
                  return (
                    <button
                      key={p.marketplacePlanId}
                      type="button"
                      className="oh-sa-restr-search-result"
                      disabled={p.restrictionStatus === "ACTIVE"}
                      onClick={() => setSelectedPlan(p)}
                    >
                      <span className="oh-sa-users-person">
                        <span className="oh-sa-users-person__text">
                          <strong className="oh-sa-users-person__name" dir="ltr">
                            {p.tierCode}
                          </strong>
                          <span className="oh-sa-users-person__sub">{name}</span>
                        </span>
                      </span>
                      <span className="oh-sa-users-cell-sub" dir="ltr">
                        {formatCount(p.currentSubscriberCount)} · {planStatusLabel(t, p.restrictionStatus)}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>
          ) : (
            <form
              className="oh-sa-users-stack"
              onSubmit={(e) => {
                e.preventDefault();
                onSubmit();
              }}
            >
              <section className="oh-sa-users-gates">
                <div className="oh-sa-users-gates__head">
                  <h3>{t("accountRestrictions.plans.sections.plan")}</h3>
                  <Button type="button" variant="secondary" onClick={() => setSelectedPlan(null)} disabled={busy}>
                    {t("accountRestrictions.plans.changePlan")}
                  </Button>
                </div>
                <div className="oh-sa-users-person">
                  <span className="oh-sa-users-person__text">
                    <strong className="oh-sa-users-person__name" dir="ltr">
                      {selectedPlan.tierCode}
                    </strong>
                    <span className="oh-sa-users-person__sub">{displayName}</span>
                  </span>
                </div>
                <div className="oh-sa-users-kv" style={{ marginTop: 12 }}>
                  <div>
                    <span>{t("accountRestrictions.plans.currentSubscribers")}</span>
                    <strong dir="ltr">{formatCount(selectedPlan.currentSubscriberCount)}</strong>
                  </div>
                  <div>
                    <span>{t("accountRestrictions.plans.columns.status")}</span>
                    <strong>{planStatusLabel(t, selectedPlan.restrictionStatus)}</strong>
                  </div>
                </div>
              </section>

              <ScopeModeField
                scopeMode={scopeMode}
                setScopeMode={(mode) => {
                  setScopeMode(mode);
                  setForm((p) => ({
                    ...p,
                    scopes: mode === "all" ? ["ALL_MARKETPLACE"] : (p.scopes || []).includes("ALL_MARKETPLACE") ? ["bids"] : p.scopes,
                  }));
                }}
                scopes={form.scopes}
                onToggleCustomScope={toggleCustomScope}
                busy={busy}
                t={t}
              />

              <DurationField
                durationId={durationId}
                setDurationId={setDurationId}
                customExpires={customExpires}
                setCustomExpires={setCustomExpires}
                busy={busy}
                t={t}
              />

              <label className="oh-sa-users-field">
                <span>{t("accountRestrictions.internalReason")}</span>
                <textarea
                  value={form.internalReason}
                  onChange={(e) => setForm((p) => ({ ...p, internalReason: e.target.value }))}
                  rows={3}
                  required
                  minLength={3}
                  placeholder={t("accountRestrictions.internalReasonPlaceholder")}
                  disabled={busy}
                />
              </label>
              <label className="oh-sa-users-field">
                <span>{t("accountRestrictions.internalNote")}</span>
                <textarea
                  value={form.internalNote}
                  onChange={(e) => setForm((p) => ({ ...p, internalNote: e.target.value }))}
                  rows={2}
                  placeholder={t("accountRestrictions.internalNotePlaceholder")}
                  disabled={busy}
                />
              </label>

              <p className="oh-sa-users-muted">{t("accountRestrictions.privacyNote")}</p>

              <div className="oh-sa-users-actions-row oh-sa-users-actions-row--primary">
                <Button type="button" variant="secondary" onClick={onClose} disabled={busy}>
                  {t("accountRestrictions.form.cancel")}
                </Button>
                <Button type="submit" disabled={busy}>
                  {busy ? t("accountRestrictions.form.working") : t("accountRestrictions.plans.restrictPlan")}
                </Button>
              </div>
            </form>
          )}
        </div>
      </aside>
    </div>
  );
}

function PlanDetailsDrawer({ open, detail, detailLoading, onClose, locale, t }) {
  if (!open || !detail) return null;
  const row = detail.row;
  const displayName = planDisplayName(row, locale);

  return (
    <div className="oh-sa-users-drawer" role="dialog" aria-modal="true" aria-labelledby="oh-sa-plan-restr-detail-title">
      <button type="button" className="oh-sa-users-drawer__backdrop" aria-label={t("accountRestrictions.form.close")} onClick={onClose} />
      <aside className="oh-sa-users-drawer__panel">
        <header className="oh-sa-users-drawer__header">
          <div>
            <h2 id="oh-sa-plan-restr-detail-title">{t("accountRestrictions.plans.drawerTitle")}</h2>
            <p className="oh-sa-users-drawer__sub">
              <span dir="ltr">{row.tierCode}</span>
              {" · "}
              {displayName}
            </p>
          </div>
          <button type="button" className="oh-sa-users-drawer__close" onClick={onClose} aria-label={t("accountRestrictions.form.close")}>
            ×
          </button>
        </header>
        <div className="oh-sa-users-drawer__body">
          {detailLoading ? <DashboardLoadingState /> : null}
          {!detailLoading ? (
            <div className="oh-sa-users-stack">
              <section className="oh-sa-users-gates" aria-label={t("accountRestrictions.plans.sections.plan")}>
                <div className="oh-sa-users-gates__head">
                  <h3>{t("accountRestrictions.plans.sections.plan")}</h3>
                </div>
                <div className="oh-sa-users-kv">
                  <div>
                    <span>{t("accountRestrictions.plans.columns.code")}</span>
                    <strong dir="ltr">{row.tierCode}</strong>
                  </div>
                  <div>
                    <span>{t("accountRestrictions.plans.columns.plan")}</span>
                    <strong>{displayName}</strong>
                  </div>
                  <div>
                    <span>{t("accountRestrictions.plans.currentSubscribers")}</span>
                    <strong dir="ltr">
                      {formatCount(detail.impact?.currentSubscriberCount ?? row.currentSubscriberCount)}
                    </strong>
                  </div>
                </div>
              </section>

              {detail.restriction ? (
                <section className="oh-sa-users-gates" aria-label={t("accountRestrictions.plans.sections.restriction")}>
                  <div className="oh-sa-users-gates__head">
                    <h3>{t("accountRestrictions.plans.sections.restriction")}</h3>
                  </div>
                  <StatusBadge tone={planStatusTone(detail.restriction.status)} className="oh-sa-users-pill">
                    {planStatusLabel(t, detail.restriction.status)}
                  </StatusBadge>
                  <div className="oh-sa-restr-scope-pills" style={{ marginTop: 8 }}>
                    {scopeLabels(t, detail.restriction.scopes).map((label) => (
                      <span key={label} className="oh-sa-restr-scope-pill">
                        {label}
                      </span>
                    ))}
                  </div>
                  <div className="oh-sa-users-kv" style={{ marginTop: 12 }}>
                    <div>
                      <span>{t("accountRestrictions.internalReason")}</span>
                      <strong>{detail.restriction.internalReason || "—"}</strong>
                    </div>
                    {detail.restriction.internalNote ? (
                      <div>
                        <span>{t("accountRestrictions.internalNote")}</span>
                        <strong>{detail.restriction.internalNote}</strong>
                      </div>
                    ) : null}
                  </div>
                </section>
              ) : null}

              <section className="oh-sa-users-gates" aria-label={t("accountRestrictions.plans.sections.impact")}>
                <div className="oh-sa-users-gates__head">
                  <h3>{t("accountRestrictions.plans.sections.impact")}</h3>
                </div>
                <div className="oh-sa-users-kv">
                  <div>
                    <span>{t("accountRestrictions.plans.currentSubscribers")}</span>
                    <strong dir="ltr">{formatCount(detail.impact?.currentSubscriberCount)}</strong>
                  </div>
                  <div>
                    <span>{t("accountRestrictions.activity.heldBids")}</span>
                    <strong dir="ltr">{formatCount(detail.impact?.heldBids)}</strong>
                  </div>
                  <div>
                    <span>{t("accountRestrictions.activity.heldClaims")}</span>
                    <strong dir="ltr">{formatCount(detail.impact?.heldClaims)}</strong>
                  </div>
                  <div>
                    <span>{t("accountRestrictions.activity.heldArticles")}</span>
                    <strong dir="ltr">{formatCount(detail.impact?.heldArticles)}</strong>
                  </div>
                </div>
              </section>

              <section className="oh-sa-users-gates" aria-label={t("accountRestrictions.plans.sections.audit")}>
                <div className="oh-sa-users-gates__head">
                  <h3>{t("accountRestrictions.plans.sections.audit")}</h3>
                </div>
                {(detail.audit || []).length === 0 ? (
                  <p className="oh-sa-users-muted">{t("accountRestrictions.activity.empty")}</p>
                ) : (
                  <div className="oh-sa-users-stack">
                    {detail.audit.map((a) => (
                      <div key={a.id} className="oh-sa-users-kv">
                        <div>
                          <span>{a.action}</span>
                          <strong>{formatLocaleDateTime(a.createdAt, locale)}</strong>
                          {a.actorName ? <span className="oh-sa-users-muted">{a.actorName}</span> : null}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </section>
            </div>
          ) : null}
        </div>
      </aside>
    </div>
  );
}

export default function SuperAdminAccountRestrictionsPlansPanel() {
  const { t, locale } = useTranslation();
  const { push } = useToast();
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [rowMenuId, setRowMenuId] = useState(null);
  const [busy, setBusy] = useState(false);

  const [addOpen, setAddOpen] = useState(false);
  const [selectedPlan, setSelectedPlan] = useState(null);
  const [scopeMode, setScopeMode] = useState("all");
  const [durationId, setDurationId] = useState("d7");
  const [customExpires, setCustomExpires] = useState("");
  const [form, setForm] = useState({ scopes: ["ALL_MARKETPLACE"], internalReason: "", internalNote: "" });
  const [confirmAddOpen, setConfirmAddOpen] = useState(false);

  const [detail, setDetail] = useState(null);
  const [detailLoading, setDetailLoading] = useState(false);

  const [editRow, setEditRow] = useState(null);
  const [editScopeMode, setEditScopeMode] = useState("all");
  const [editScopes, setEditScopes] = useState(["ALL_MARKETPLACE"]);
  const [extendRow, setExtendRow] = useState(null);
  const [extendDurationId, setExtendDurationId] = useState("d7");
  const [extendCustom, setExtendCustom] = useState("");
  const [revokeRow, setRevokeRow] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const res = await listSuperAdminPlanRestrictionsRequest();
      setItems(res?.data?.items || []);
      setRowMenuId(null);
    } catch (err) {
      setError(errorMessage(err, t, locale));
      setItems([]);
    } finally {
      setLoading(false);
    }
  }, [t, locale]);

  useEffect(() => {
    void load();
  }, [load]);

  const planChoices = useMemo(
    () => items.filter((p) => p.restrictionStatus !== "ACTIVE"),
    [items],
  );

  const openAdd = () => {
    setRowMenuId(null);
    setAddOpen(true);
    setSelectedPlan(null);
    setScopeMode("all");
    setDurationId("d7");
    setCustomExpires("");
    setForm({ scopes: ["ALL_MARKETPLACE"], internalReason: "", internalNote: "" });
  };

  const closeAdd = () => {
    if (busy) return;
    setAddOpen(false);
    setSelectedPlan(null);
    setConfirmAddOpen(false);
  };

  const openDetails = async (row) => {
    setRowMenuId(null);
    const restrictionId = row.activeRestriction?.id || row.restrictionId;
    if (!restrictionId) {
      setDetail({ row, restriction: null, audit: [], impact: { currentSubscriberCount: row.currentSubscriberCount } });
      return;
    }
    setDetailLoading(true);
    setDetail({ row, restriction: null, audit: [], impact: { currentSubscriberCount: row.currentSubscriberCount } });
    try {
      const res = await getSuperAdminPlanRestrictionRequest(restrictionId);
      setDetail({
        row,
        restriction: res?.data?.restriction || null,
        audit: res?.data?.audit || [],
        impact: res?.data?.impact || { currentSubscriberCount: row.currentSubscriberCount },
      });
    } catch (err) {
      push({ type: "error", message: errorMessage(err, t, locale) });
      setDetail(null);
    } finally {
      setDetailLoading(false);
    }
  };

  const requestCreateConfirm = () => {
    if (!selectedPlan?.marketplacePlanId) return;
    if (selectedPlan.restrictionStatus === "ACTIVE") {
      push({ type: "error", message: t("accountRestrictions.plans.alreadyActive") });
      return;
    }
    const reason = String(form.internalReason || "").trim();
    if (reason.length < 3) {
      push({ type: "error", message: t("accountRestrictions.form.reasonRequired") });
      return;
    }
    setConfirmAddOpen(true);
  };

  const submitCreate = async () => {
    if (!selectedPlan?.marketplacePlanId) return;
    const reason = String(form.internalReason || "").trim();
    if (reason.length < 3) {
      push({ type: "error", message: t("accountRestrictions.form.reasonRequired") });
      return;
    }
    setBusy(true);
    try {
      await createSuperAdminPlanRestrictionRequest({
        marketplacePlanId: Number(selectedPlan.marketplacePlanId),
        restrictionType: "ACCOUNT_REVIEW_HOLD",
        scopes: scopeMode === "all" ? ["ALL_MARKETPLACE"] : form.scopes,
        internalReason: reason,
        internalNote: form.internalNote?.trim() || null,
        expiresAt: expiresAtFromDuration(durationId, customExpires),
      });
      push({ type: "success", message: t("accountRestrictions.plans.saveOk") });
      setConfirmAddOpen(false);
      setAddOpen(false);
      setSelectedPlan(null);
      await load();
    } catch (err) {
      push({ type: "error", message: errorMessage(err, t, locale) });
    } finally {
      setBusy(false);
    }
  };

  const actionsFor = (row) => {
    const active = row.restrictionStatus === "ACTIVE";
    if (active) {
      return [
        { key: "details", label: t("accountRestrictions.viewDetails"), onClick: () => openDetails(row) },
        {
          key: "edit",
          label: t("accountRestrictions.edit"),
          onClick: () => {
            setEditRow(row.activeRestriction || row);
            setEditScopeMode(
              (row.scopes || []).includes("ALL_MARKETPLACE") || !row.scopes?.length ? "all" : "custom",
            );
            setEditScopes(row.scopes?.length ? row.scopes : ["ALL_MARKETPLACE"]);
          },
        },
        {
          key: "extend",
          label: t("accountRestrictions.extend"),
          onClick: () => {
            setExtendRow(row.activeRestriction || row);
            setExtendDurationId("d7");
            setExtendCustom("");
          },
        },
        {
          key: "revoke",
          label: t("accountRestrictions.revoke"),
          danger: true,
          onClick: () => {
            setRevokeRow(row.activeRestriction || row);
          },
        },
        { key: "audit", label: t("accountRestrictions.viewLog"), onClick: () => openDetails(row) },
      ];
    }
    if (row.restrictionStatus === "NONE") {
      return [
        {
          key: "restrict",
          label: t("accountRestrictions.plans.restrictPlan"),
          onClick: () => {
            openAdd();
            setSelectedPlan(row);
          },
        },
      ];
    }
    return [
      { key: "details", label: t("accountRestrictions.viewDetails"), onClick: () => openDetails(row) },
      { key: "log", label: t("accountRestrictions.viewLog"), onClick: () => openDetails(row) },
      {
        key: "again",
        label: t("accountRestrictions.plans.restrictAgain"),
        onClick: () => {
          openAdd();
          setSelectedPlan(row);
        },
      },
    ];
  };

  return (
    <>
      <header className="oh-sa-users-list-head">
        <div className="oh-sa-users-list-head__top">
          <div className="oh-sa-users-list-head__titles">
            <h2 className="oh-sa-users-list-head__title">{t("accountRestrictions.plans.listTitle")}</h2>
            <p className="oh-sa-users-list-head__desc">
              {t("accountRestrictions.plans.listCount", { count: formatCount(items.length) })}
            </p>
          </div>
          <div className="oh-sa-users-list-head__actions">
            <Button type="button" onClick={openAdd}>
              {t("accountRestrictions.plans.addPlan")}
            </Button>
          </div>
        </div>
      </header>

      {error ? <DashboardErrorState title={error} /> : null}
      {loading ? <DashboardLoadingState /> : null}
      {!loading && !error && items.length === 0 ? (
        <DashboardEmptyState
          title={t("accountRestrictions.plans.emptyTitle")}
          description={t("accountRestrictions.plans.emptyDescription")}
        />
      ) : null}

      {!loading && !error && items.length > 0 ? (
        <div className="oh-sa-users-table-wrap oh-sa-users-table-wrap--airy">
          <table className="oh-sa-users-table oh-sa-users-table--airy">
            <thead>
              <tr>
                <th className="oh-sa-users-col oh-sa-users-col--user">{t("accountRestrictions.plans.columns.plan")}</th>
                <th className="oh-sa-users-col">{t("accountRestrictions.plans.columns.code")}</th>
                <th className="oh-sa-users-col">{t("accountRestrictions.plans.columns.subscribers")}</th>
                <th className="oh-sa-users-col">{t("accountRestrictions.plans.columns.status")}</th>
                <th className="oh-sa-users-col">{t("accountRestrictions.plans.columns.scope")}</th>
                <th className="oh-sa-users-col oh-sa-restr-col--addedAt">{t("accountRestrictions.plans.columns.startsAt")}</th>
                <th className="oh-sa-users-col oh-sa-restr-col--expires">{t("accountRestrictions.plans.columns.expiresAt")}</th>
                <th className="oh-sa-users-col oh-sa-restr-col--addedBy">{t("accountRestrictions.plans.columns.addedBy")}</th>
                <th className="oh-sa-users-col oh-sa-users-col--actions">{t("accountRestrictions.plans.columns.actions")}</th>
              </tr>
            </thead>
            <tbody>
              {items.map((row) => {
                const id = String(row.marketplacePlanId);
                const displayName = planDisplayName(row, locale);
                return (
                  <tr key={id} onDoubleClick={() => openDetails(row)} style={{ cursor: "pointer" }}>
                    <td className="oh-sa-users-col oh-sa-users-col--user">
                      <div className="oh-sa-users-person">
                        <span className="oh-sa-users-person__text">
                          <strong className="oh-sa-users-person__name">{displayName}</strong>
                          <span className="oh-sa-users-person__sub">
                            {t("accountRestrictions.plans.marketplaceMembership")}
                          </span>
                        </span>
                      </div>
                    </td>
                    <td className="oh-sa-users-col">
                      <span className="oh-sa-users-cell-primary" dir="ltr">
                        {row.tierCode}
                      </span>
                    </td>
                    <td className="oh-sa-users-col">
                      <span className="oh-sa-users-cell-primary" dir="ltr">
                        {formatCount(row.currentSubscriberCount)}
                      </span>
                    </td>
                    <td className="oh-sa-users-col">
                      <StatusBadge tone={planStatusTone(row.restrictionStatus)} className="oh-sa-users-pill">
                        {planStatusLabel(t, row.restrictionStatus)}
                      </StatusBadge>
                    </td>
                    <td className="oh-sa-users-col">
                      {row.scopes ? (
                        <div className="oh-sa-restr-scope-pills">
                          {scopeLabels(t, row.scopes).map((label) => (
                            <span key={label} className="oh-sa-restr-scope-pill">
                              {label}
                            </span>
                          ))}
                        </div>
                      ) : (
                        <span className="oh-sa-users-cell-sub">—</span>
                      )}
                    </td>
                    <td className="oh-sa-users-col oh-sa-restr-col--addedAt">
                      <span className="oh-sa-users-cell-sub">
                        {row.startsAt ? formatLocaleDate(row.startsAt, locale) : "—"}
                      </span>
                    </td>
                    <td className="oh-sa-users-col oh-sa-restr-col--expires">
                      <span className="oh-sa-users-cell-sub">
                        {row.expiresAt
                          ? formatLocaleDate(row.expiresAt, locale)
                          : row.restrictionStatus === "ACTIVE"
                            ? t("accountRestrictions.noExpiry")
                            : "—"}
                      </span>
                    </td>
                    <td className="oh-sa-users-col oh-sa-restr-col--addedBy">
                      <span className="oh-sa-users-cell-sub">{row.createdByName || "—"}</span>
                    </td>
                    <td className="oh-sa-users-col oh-sa-users-col--actions">
                      <RowActionsMenu
                        open={rowMenuId === id}
                        onOpenChange={(next) => setRowMenuId(next ? id : null)}
                        label={t("accountRestrictions.actionsFor", { name: row.tierCode })}
                        items={actionsFor(row)}
                      />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : null}

      <PlanRestrictDrawer
        open={addOpen}
        onClose={closeAdd}
        busy={busy}
        selectedPlan={selectedPlan}
        setSelectedPlan={setSelectedPlan}
        planChoices={planChoices.length ? planChoices : items}
        form={form}
        setForm={setForm}
        scopeMode={scopeMode}
        setScopeMode={setScopeMode}
        durationId={durationId}
        setDurationId={setDurationId}
        customExpires={customExpires}
        setCustomExpires={setCustomExpires}
        onSubmit={requestCreateConfirm}
        locale={locale}
        t={t}
      />

      <PlanDetailsDrawer
        open={Boolean(detail)}
        detail={detail}
        detailLoading={detailLoading}
        onClose={() => setDetail(null)}
        locale={locale}
        t={t}
      />

      <ConfirmDialog
        open={confirmAddOpen}
        title={t("accountRestrictions.plans.impactConfirmTitle")}
        body={`${t("accountRestrictions.plans.impactConfirmBody", {
          tier: selectedPlan?.tierCode || "",
        })}\n${t("accountRestrictions.plans.impactCount", {
          count: formatCount(selectedPlan?.currentSubscriberCount || 0),
        })}`}
        confirmLabel={t("accountRestrictions.plans.restrictPlan")}
        cancelLabel={t("accountRestrictions.form.cancel")}
        onConfirm={() => void submitCreate()}
        onCancel={() => setConfirmAddOpen(false)}
        confirmBusy={busy}
      />

      <ConfirmDialog
        open={Boolean(revokeRow)}
        title={t("accountRestrictions.revokeWorkflow.title")}
        body={t("accountRestrictions.revokeWorkflow.description")}
        confirmLabel={t("accountRestrictions.revokeWorkflow.confirm")}
        cancelLabel={t("accountRestrictions.form.cancel")}
        onConfirm={async () => {
          if (!revokeRow?.id) return;
          setBusy(true);
          try {
            await revokeSuperAdminPlanRestrictionRequest(revokeRow.id, { revokeReason: null });
            push({ type: "success", message: t("accountRestrictions.plans.revokeOk") });
            setRevokeRow(null);
            await load();
          } catch (err) {
            push({ type: "error", message: errorMessage(err, t, locale) });
          } finally {
            setBusy(false);
          }
        }}
        onCancel={() => setRevokeRow(null)}
        confirmBusy={busy}
      />

      {extendRow ? (
        <ConfirmDialog
          open
          title={t("accountRestrictions.extendWorkflow.title")}
          body={
            <div className="oh-sa-users-stack">
              <DurationField
                durationId={extendDurationId}
                setDurationId={setExtendDurationId}
                customExpires={extendCustom}
                setCustomExpires={setExtendCustom}
                busy={busy}
                t={t}
                allowNone={false}
              />
            </div>
          }
          confirmLabel={t("accountRestrictions.extendWorkflow.confirm")}
          cancelLabel={t("accountRestrictions.form.cancel")}
          onConfirm={async () => {
            const expiresAt = expiresAtFromDuration(extendDurationId, extendCustom);
            if (!expiresAt || !extendRow.id) return;
            setBusy(true);
            try {
              await extendSuperAdminPlanRestrictionRequest(extendRow.id, { expiresAt });
              push({ type: "success", message: t("accountRestrictions.plans.extendOk") });
              setExtendRow(null);
              await load();
            } catch (err) {
              push({ type: "error", message: errorMessage(err, t, locale) });
            } finally {
              setBusy(false);
            }
          }}
          onCancel={() => setExtendRow(null)}
          confirmBusy={busy}
        />
      ) : null}

      {editRow ? (
        <ConfirmDialog
          open
          title={t("accountRestrictions.editWorkflow.title")}
          body={
            <ScopeModeField
              scopeMode={editScopeMode}
              setScopeMode={(mode) => {
                setEditScopeMode(mode);
                setEditScopes(mode === "all" ? ["ALL_MARKETPLACE"] : ["bids"]);
              }}
              scopes={editScopes}
              onToggleCustomScope={(scope) => {
                setEditScopes((prev) => {
                  const current = (prev || []).filter((s) => s !== "ALL_MARKETPLACE");
                  const next = current.includes(scope) ? current.filter((s) => s !== scope) : [...current, scope];
                  return next.length ? next : ["bids"];
                });
              }}
              busy={busy}
              t={t}
            />
          }
          confirmLabel={t("accountRestrictions.editWorkflow.confirm")}
          cancelLabel={t("accountRestrictions.form.cancel")}
          onConfirm={async () => {
            if (!editRow.id) return;
            setBusy(true);
            try {
              await updateSuperAdminPlanRestrictionRequest(editRow.id, {
                scopes: editScopeMode === "all" ? ["ALL_MARKETPLACE"] : editScopes,
              });
              push({ type: "success", message: t("accountRestrictions.plans.updateOk") });
              setEditRow(null);
              await load();
            } catch (err) {
              push({ type: "error", message: errorMessage(err, t, locale) });
            } finally {
              setBusy(false);
            }
          }}
          onCancel={() => setEditRow(null)}
          confirmBusy={busy}
        />
      ) : null}
    </>
  );
}
