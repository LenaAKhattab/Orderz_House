import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { MoreVertical, X } from "lucide-react";
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
    window.addEventListener("resize", update);
    window.addEventListener("scroll", update, true);
    const onDoc = (e) => {
      if (triggerRef.current?.contains(e.target) || panelRef.current?.contains(e.target)) return;
      onOpenChange(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => {
      window.removeEventListener("resize", update);
      window.removeEventListener("scroll", update, true);
      document.removeEventListener("mousedown", onDoc);
    };
  }, [open, onOpenChange]);

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        className="oh-sa-users-row-menu-btn"
        aria-label={label}
        aria-expanded={open}
        onClick={(e) => {
          e.stopPropagation();
          onOpenChange(!open);
        }}
      >
        <MoreVertical size={16} strokeWidth={2.25} aria-hidden />
      </button>
      {open && pos
        ? createPortal(
            <div
              ref={panelRef}
              className="oh-sa-users-row-menu"
              style={{ position: "fixed", top: pos.top, left: pos.left, zIndex: 80 }}
              role="menu"
            >
              {items.map((item) => (
                <button
                  key={item.key}
                  type="button"
                  role="menuitem"
                  className="oh-sa-users-row-menu__item"
                  onClick={() => {
                    onOpenChange(false);
                    item.onClick?.();
                  }}
                >
                  {item.label}
                </button>
              ))}
            </div>,
            document.body,
          )
        : null}
    </>
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
  const [revokeReason, setRevokeReason] = useState("");

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

  const unrestrictedPlans = useMemo(
    () => items.filter((p) => p.restrictionStatus !== "ACTIVE"),
    [items],
  );

  const openAdd = () => {
    setAddOpen(true);
    setSelectedPlan(null);
    setScopeMode("all");
    setDurationId("d7");
    setCustomExpires("");
    setForm({ scopes: ["ALL_MARKETPLACE"], internalReason: "", internalNote: "" });
  };

  const openDetails = async (row) => {
    const restrictionId = row.activeRestriction?.id || row.restrictionId;
    if (!restrictionId) {
      setDetail({ row, restriction: null, audit: [], impact: { currentSubscriberCount: row.currentSubscriberCount } });
      return;
    }
    setDetailLoading(true);
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
    } finally {
      setDetailLoading(false);
    }
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
          onClick: () => {
            setRevokeRow(row.activeRestriction || row);
            setRevokeReason("");
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
                const displayName = locale?.startsWith("en")
                  ? row.planNameEn || row.tierCode
                  : row.planNameAr || row.tierCode;
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

      {addOpen ? (
        <div className="oh-sa-users-drawer-root" role="presentation">
          <button type="button" className="oh-sa-users-drawer-backdrop" aria-label={t("accountRestrictions.form.close")} onClick={() => setAddOpen(false)} />
          <aside className="oh-sa-users-drawer" role="dialog" aria-modal="true">
            <header className="oh-sa-users-drawer__head">
              <h3 className="oh-sa-users-drawer__title">{t("accountRestrictions.plans.addWorkflowTitle")}</h3>
              <button type="button" className="oh-sa-users-drawer__close" onClick={() => setAddOpen(false)}>
                <X size={18} aria-hidden />
              </button>
            </header>
            <div className="oh-sa-users-drawer__body">
              {!selectedPlan ? (
                <div className="oh-sa-users-drawer__section">
                  <h4 className="oh-sa-users-drawer__section-title">{t("accountRestrictions.plans.selectPlan")}</h4>
                  <div className="oh-sa-users-search-results">
                    {(unrestrictedPlans.length ? unrestrictedPlans : items).map((p) => (
                      <button
                        key={p.marketplacePlanId}
                        type="button"
                        className="oh-sa-users-search-result"
                        disabled={p.restrictionStatus === "ACTIVE"}
                        onClick={() => setSelectedPlan(p)}
                      >
                        <strong dir="ltr">{p.tierCode}</strong>
                        <span>
                          {t("accountRestrictions.plans.currentSubscribers")}: {formatCount(p.currentSubscriberCount)}
                        </span>
                        <span>{planStatusLabel(t, p.restrictionStatus)}</span>
                      </button>
                    ))}
                  </div>
                </div>
              ) : (
                <form
                  className="oh-sa-users-drawer__form"
                  onSubmit={(e) => {
                    e.preventDefault();
                    if (selectedPlan.restrictionStatus === "ACTIVE") {
                      push({ type: "error", message: t("accountRestrictions.plans.alreadyActive") });
                      return;
                    }
                    setConfirmAddOpen(true);
                  }}
                >
                  <div className="oh-sa-users-drawer__section">
                    <p className="oh-sa-users-cell-primary" dir="ltr">
                      {selectedPlan.tierCode}
                    </p>
                    <p className="oh-sa-users-cell-sub">
                      {t("accountRestrictions.plans.currentSubscribers")}:{" "}
                      {formatCount(selectedPlan.currentSubscriberCount)}
                    </p>
                    <Button type="button" variant="ghost" onClick={() => setSelectedPlan(null)}>
                      {t("accountRestrictions.addWorkflow.changeUser")}
                    </Button>
                  </div>

                  <div className="oh-sa-users-drawer__section">
                    <h4 className="oh-sa-users-drawer__section-title">{t("accountRestrictions.scopes")}</h4>
                    <div className="oh-sa-restr-scope-mode">
                      <label>
                        <input
                          type="radio"
                          checked={scopeMode === "all"}
                          onChange={() => {
                            setScopeMode("all");
                            setForm((f) => ({ ...f, scopes: ["ALL_MARKETPLACE"] }));
                          }}
                        />
                        {t("accountRestrictions.scopeMode.all")}
                      </label>
                      <label>
                        <input
                          type="radio"
                          checked={scopeMode === "custom"}
                          onChange={() => {
                            setScopeMode("custom");
                            setForm((f) => ({ ...f, scopes: ["bids"] }));
                          }}
                        />
                        {t("accountRestrictions.scopeMode.custom")}
                      </label>
                    </div>
                    {scopeMode === "custom" ? (
                      <div className="oh-sa-restr-scope-checks">
                        {CUSTOM_SCOPES.map((s) => (
                          <label key={s}>
                            <input
                              type="checkbox"
                              checked={form.scopes.includes(s)}
                              onChange={(e) => {
                                setForm((f) => {
                                  const next = e.target.checked
                                    ? [...f.scopes.filter((x) => x !== "ALL_MARKETPLACE"), s]
                                    : f.scopes.filter((x) => x !== s);
                                  return { ...f, scopes: next.length ? next : ["bids"] };
                                });
                              }}
                            />
                            {t(`accountRestrictions.scopesLabels.${s}`)}
                          </label>
                        ))}
                      </div>
                    ) : null}
                  </div>

                  <label className="oh-sa-users-field">
                    <span>{t("accountRestrictions.internalReason")}</span>
                    <textarea
                      required
                      value={form.internalReason}
                      onChange={(e) => setForm((f) => ({ ...f, internalReason: e.target.value }))}
                      placeholder={t("accountRestrictions.internalReasonPlaceholder")}
                    />
                  </label>
                  <label className="oh-sa-users-field">
                    <span>{t("accountRestrictions.internalNote")}</span>
                    <textarea
                      value={form.internalNote}
                      onChange={(e) => setForm((f) => ({ ...f, internalNote: e.target.value }))}
                      placeholder={t("accountRestrictions.internalNotePlaceholder")}
                    />
                  </label>

                  <div className="oh-sa-users-drawer__section">
                    <h4 className="oh-sa-users-drawer__section-title">{t("accountRestrictions.duration.label")}</h4>
                    <select value={durationId} onChange={(e) => setDurationId(e.target.value)}>
                      {DURATION_OPTIONS.map((opt) => (
                        <option key={opt.id} value={opt.id}>
                          {t(`accountRestrictions.duration.${opt.id}`)}
                        </option>
                      ))}
                    </select>
                    {durationId === "custom" ? (
                      <input
                        type="datetime-local"
                        value={customExpires}
                        onChange={(e) => setCustomExpires(e.target.value)}
                      />
                    ) : null}
                  </div>

                  <p className="oh-sa-users-cell-sub">{t("accountRestrictions.privacyNote")}</p>

                  <div className="oh-sa-users-drawer__footer">
                    <Button type="button" variant="ghost" onClick={() => setAddOpen(false)}>
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
      ) : null}

      {detail ? (
        <div className="oh-sa-users-drawer-root" role="presentation">
          <button type="button" className="oh-sa-users-drawer-backdrop" aria-label={t("accountRestrictions.form.close")} onClick={() => setDetail(null)} />
          <aside className="oh-sa-users-drawer" role="dialog" aria-modal="true">
            <header className="oh-sa-users-drawer__head">
              <h3 className="oh-sa-users-drawer__title">{t("accountRestrictions.plans.drawerTitle")}</h3>
              <button type="button" className="oh-sa-users-drawer__close" onClick={() => setDetail(null)}>
                <X size={18} aria-hidden />
              </button>
            </header>
            <div className="oh-sa-users-drawer__body">
              {detailLoading ? <DashboardLoadingState /> : null}
              <div className="oh-sa-users-drawer__section">
                <h4 className="oh-sa-users-drawer__section-title">{t("accountRestrictions.plans.sections.plan")}</h4>
                <p className="oh-sa-users-cell-primary" dir="ltr">
                  {detail.row.tierCode}
                </p>
                <p className="oh-sa-users-cell-sub">
                  {t("accountRestrictions.plans.currentSubscribers")}:{" "}
                  {formatCount(detail.impact?.currentSubscriberCount ?? detail.row.currentSubscriberCount)}
                </p>
              </div>
              {detail.restriction ? (
                <div className="oh-sa-users-drawer__section">
                  <h4 className="oh-sa-users-drawer__section-title">{t("accountRestrictions.plans.sections.restriction")}</h4>
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
                  <p className="oh-sa-users-cell-sub" style={{ marginTop: 8 }}>
                    {detail.restriction.internalReason}
                  </p>
                  {detail.restriction.internalNote ? (
                    <p className="oh-sa-users-cell-sub">{detail.restriction.internalNote}</p>
                  ) : null}
                </div>
              ) : null}
              <div className="oh-sa-users-drawer__section">
                <h4 className="oh-sa-users-drawer__section-title">{t("accountRestrictions.plans.sections.impact")}</h4>
                <ul className="oh-sa-users-cell-sub">
                  <li>
                    {t("accountRestrictions.plans.currentSubscribers")}:{" "}
                    {formatCount(detail.impact?.currentSubscriberCount)}
                  </li>
                  <li>
                    {t("accountRestrictions.activity.heldBids")}: {formatCount(detail.impact?.heldBids)}
                  </li>
                  <li>
                    {t("accountRestrictions.activity.heldClaims")}: {formatCount(detail.impact?.heldClaims)}
                  </li>
                  <li>
                    {t("accountRestrictions.activity.heldArticles")}: {formatCount(detail.impact?.heldArticles)}
                  </li>
                </ul>
              </div>
              <div className="oh-sa-users-drawer__section">
                <h4 className="oh-sa-users-drawer__section-title">{t("accountRestrictions.plans.sections.audit")}</h4>
                {(detail.audit || []).length === 0 ? (
                  <p className="oh-sa-users-cell-sub">{t("accountRestrictions.activity.empty")}</p>
                ) : (
                  <ul className="oh-sa-users-audit-list">
                    {detail.audit.map((a) => (
                      <li key={a.id}>
                        <strong>{a.action}</strong>
                        <span>{formatLocaleDateTime(a.createdAt, locale)}</span>
                        {a.actorName ? <span>{a.actorName}</span> : null}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>
          </aside>
        </div>
      ) : null}

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
            await revokeSuperAdminPlanRestrictionRequest(revokeRow.id, {
              revokeReason: revokeReason.trim() || null,
            });
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
            <div>
              <select value={extendDurationId} onChange={(e) => setExtendDurationId(e.target.value)}>
                {DURATION_OPTIONS.filter((o) => o.id !== "none").map((opt) => (
                  <option key={opt.id} value={opt.id}>
                    {t(`accountRestrictions.duration.${opt.id}`)}
                  </option>
                ))}
              </select>
              {extendDurationId === "custom" ? (
                <input
                  type="datetime-local"
                  value={extendCustom}
                  onChange={(e) => setExtendCustom(e.target.value)}
                />
              ) : null}
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
            <div>
              <div className="oh-sa-restr-scope-mode">
                <label>
                  <input
                    type="radio"
                    checked={editScopeMode === "all"}
                    onChange={() => {
                      setEditScopeMode("all");
                      setEditScopes(["ALL_MARKETPLACE"]);
                    }}
                  />
                  {t("accountRestrictions.scopeMode.all")}
                </label>
                <label>
                  <input
                    type="radio"
                    checked={editScopeMode === "custom"}
                    onChange={() => {
                      setEditScopeMode("custom");
                      setEditScopes(["bids"]);
                    }}
                  />
                  {t("accountRestrictions.scopeMode.custom")}
                </label>
              </div>
              {editScopeMode === "custom" ? (
                <div className="oh-sa-restr-scope-checks">
                  {CUSTOM_SCOPES.map((s) => (
                    <label key={s}>
                      <input
                        type="checkbox"
                        checked={editScopes.includes(s)}
                        onChange={(e) => {
                          setEditScopes((prev) => {
                            const next = e.target.checked
                              ? [...prev.filter((x) => x !== "ALL_MARKETPLACE"), s]
                              : prev.filter((x) => x !== s);
                            return next.length ? next : ["bids"];
                          });
                        }}
                      />
                      {t(`accountRestrictions.scopesLabels.${s}`)}
                    </label>
                  ))}
                </div>
              ) : null}
            </div>
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
