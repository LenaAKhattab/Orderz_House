import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useSearchParams } from "react-router-dom";
import { MoreVertical, Search, X } from "lucide-react";
import Button from "../../components/ui/Button";
import DashboardShell from "../../components/dashboard/DashboardShell";
import DashboardSection from "../../components/dashboard/DashboardSection";
import DashboardEmptyState from "../../components/dashboard/DashboardEmptyState";
import DashboardLoadingState from "../../components/dashboard/DashboardLoadingState";
import DashboardErrorState from "../../components/dashboard/DashboardErrorState";
import StatusBadge from "../../components/dashboard/StatusBadge";
import Pagination from "../../components/common/Pagination";
import ConfirmDialog from "../../components/dashboard/ConfirmDialog";
import { useToast } from "../../components/ui/toastContext";
import { useTranslation } from "../../i18n/LanguageProvider";
import { formatLocaleDate, formatLocaleDateTime } from "../../i18n/formatLocale";
import { presentServerMessage } from "../../i18n/presentServerMessage";
import "../../i18n/accountRestrictionsResources";
import {
  createSuperAdminAccountRestrictionRequest,
  extendSuperAdminAccountRestrictionRequest,
  getSuperAdminUserAccountRestrictionsRequest,
  getSuperAdminUserDetailRequest,
  listSuperAdminAccountRestrictionsRequest,
  listSuperAdminHeldBidsRequest,
  listSuperAdminUsersRequest,
  rejectSuperAdminHeldBidRequest,
  releaseSuperAdminHeldBidRequest,
  revokeSuperAdminAccountRestrictionRequest,
  updateSuperAdminAccountRestrictionRequest,
} from "../../services/api";
import SuperAdminAccountRestrictionsPlansPanel from "./SuperAdminAccountRestrictionsPlansPanel";
import "./superAdminUsersPage.css";
import "./superAdminAccountRestrictionsPage.css";

const PAGE_SIZE = 20;
const SEARCH_DEBOUNCE_MS = 350;

const PRIMARY_TABS = [
  { id: "users", labelKey: "accountRestrictions.primaryTabs.users" },
  { id: "plans", labelKey: "accountRestrictions.primaryTabs.plans" },
];

const FILTER_TABS = [
  { id: "ACTIVE", labelKey: "accountRestrictions.tabs.active" },
  { id: "EXPIRED", labelKey: "accountRestrictions.tabs.expired" },
  { id: "REVOKED", labelKey: "accountRestrictions.tabs.revoked" },
  { id: "ALL", labelKey: "accountRestrictions.tabs.all" },
];

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

function statusTone(status) {
  if (status === "ACTIVE") return "warning";
  if (status === "EXPIRED") return "inactive";
  if (status === "REVOKED") return "success";
  return "neutral";
}

function statusLabel(t, status) {
  const key = `accountRestrictions.statusLabels.${status}`;
  const text = t(key);
  return text === key ? String(status || "—") : text;
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

function PersonCell({ name, sub, avatarUrl }) {
  const { t } = useTranslation();
  const initial = String(name || sub || "?")
    .trim()
    .slice(0, 1)
    .toUpperCase();
  return (
    <div className="oh-sa-users-person">
      <span className="oh-sa-users-person__avatar-wrap">
        <span className="oh-sa-users-person__avatar" aria-hidden>
          {avatarUrl ? <img src={avatarUrl} alt="" /> : initial}
        </span>
      </span>
      <span className="oh-sa-users-person__text">
        <strong className="oh-sa-users-person__name">{name || t("accountRestrictions.unnamed")}</strong>
        {sub ? (
          <span className="oh-sa-users-person__sub" dir="ltr">
            {sub}
          </span>
        ) : null}
      </span>
    </div>
  );
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

function RestrictionDetailsDrawer({
  open,
  row,
  audit,
  heldBids,
  loading,
  onClose,
  onReleaseBid,
  onRejectBid,
  busy,
  inheritedPlanRestrictions = [],
}) {
  const { t, locale } = useTranslation();
  if (!open) return null;
  const scopes = scopeLabels(t, row?.scopes);

  return (
    <div className="oh-sa-users-drawer" role="dialog" aria-modal="true" aria-labelledby="oh-sa-restr-drawer-title">
      <button type="button" className="oh-sa-users-drawer__backdrop" aria-label={t("accountRestrictions.form.close")} onClick={onClose} />
      <aside className="oh-sa-users-drawer__panel">
        <header className="oh-sa-users-drawer__header">
          <div>
            <h2 id="oh-sa-restr-drawer-title">{row?.userName || t("accountRestrictions.detailsTitle")}</h2>
            <p className="oh-sa-users-drawer__sub" dir="ltr">
              {row?.userEmail || "—"} · #{row?.userId}
            </p>
          </div>
          <button type="button" className="oh-sa-users-drawer__close" onClick={onClose} aria-label={t("accountRestrictions.form.close")}>
            ×
          </button>
        </header>
        <div className="oh-sa-users-drawer__body">
          {loading ? <DashboardLoadingState /> : null}
          {!loading && row ? (
            <div className="oh-sa-users-stack">
              <section className="oh-sa-users-gates" aria-label={t("accountRestrictions.sections.user")}>
                <div className="oh-sa-users-gates__head">
                  <h3>{t("accountRestrictions.sections.user")}</h3>
                </div>
                <div className="oh-sa-users-kv">
                  <div>
                    <span>{t("accountRestrictions.columns.user")}</span>
                    <strong>{row.userName || "—"}</strong>
                  </div>
                  <div>
                    <span>{t("accountRestrictions.columns.userId")}</span>
                    <strong dir="ltr">{row.userId}</strong>
                  </div>
                  <div>
                    <span>{t("accountRestrictions.columns.email")}</span>
                    <strong dir="ltr">{row.userEmail || "—"}</strong>
                  </div>
                  <div>
                    <span>{t("accountRestrictions.columns.plan")}</span>
                    <strong>{row.planTitle || "—"}</strong>
                  </div>
                </div>
              </section>

              {inheritedPlanRestrictions?.length ? (
                <section className="oh-sa-users-gates" aria-label={t("accountRestrictions.plans.inheritedLabel", { tier: "" })}>
                  <div className="oh-sa-users-gates__head">
                    <h3>{t("accountRestrictions.plans.listTitle")}</h3>
                  </div>
                  <ul className="oh-sa-users-audit">
                    {inheritedPlanRestrictions.map((pr) => (
                      <li key={pr.id}>
                        <strong>
                          {t("accountRestrictions.plans.inheritedLabel", { tier: pr.tierCode || "" })}
                        </strong>
                        <p>{scopeLabels(t, pr.scopes).join(" · ")}</p>
                      </li>
                    ))}
                  </ul>
                </section>
              ) : null}

              <section className="oh-sa-users-gates" aria-label={t("accountRestrictions.sections.restriction")}>
                <div className="oh-sa-users-gates__head">
                  <h3>{t("accountRestrictions.sections.restriction")}</h3>
                  <StatusBadge tone={statusTone(row.status)} className="oh-sa-users-pill">
                    {statusLabel(t, row.status)}
                  </StatusBadge>
                </div>
                <div className="oh-sa-users-kv">
                  <div>
                    <span>{t("accountRestrictions.restrictionTypeLabel")}</span>
                    <strong>{t("accountRestrictions.restrictionTypeLabel")}</strong>
                  </div>
                  <div>
                    <span>{t("accountRestrictions.scopes")}</span>
                    <strong>{scopes.join(" · ")}</strong>
                  </div>
                  <div>
                    <span>{t("accountRestrictions.internalReason")}</span>
                    <strong>{row.internalReason || "—"}</strong>
                  </div>
                  <div>
                    <span>{t("accountRestrictions.internalNote")}</span>
                    <strong>{row.internalNote || "—"}</strong>
                  </div>
                  <div>
                    <span>{t("accountRestrictions.columns.addedAt")}</span>
                    <strong>{formatLocaleDateTime(row.createdAt || row.startsAt, locale)}</strong>
                  </div>
                  <div>
                    <span>{t("accountRestrictions.columns.expiresAt")}</span>
                    <strong>
                      {row.expiresAt ? formatLocaleDateTime(row.expiresAt, locale) : t("accountRestrictions.noExpiry")}
                    </strong>
                  </div>
                  <div>
                    <span>{t("accountRestrictions.columns.addedBy")}</span>
                    <strong>{row.createdByName || row.createdByAdminId || "—"}</strong>
                  </div>
                </div>
              </section>

              <section className="oh-sa-users-gates" aria-label={t("accountRestrictions.sections.activity")}>
                <div className="oh-sa-users-gates__head">
                  <h3>{t("accountRestrictions.sections.activity")}</h3>
                </div>
                {heldBids?.length ? (
                  <ul className="oh-sa-users-audit">
                    {heldBids.map((b) => (
                      <li key={b.id}>
                        <div className="oh-sa-users-audit__top">
                          <strong>
                            {t("accountRestrictions.activity.heldBids")} #{b.id}
                          </strong>
                          <span>{formatLocaleDateTime(b.heldAt || b.createdAt, locale)}</span>
                        </div>
                        <p dir="ltr">
                          order #{b.orderId} · {b.amount} JOD
                        </p>
                        {row.status === "ACTIVE" ? (
                          <div className="oh-sa-users-actions-row">
                            <Button type="button" disabled={busy} onClick={() => onReleaseBid(b.id)}>
                              {t("accountRestrictions.releaseBid")}
                            </Button>
                            <Button type="button" variant="danger" disabled={busy} onClick={() => onRejectBid(b.id)}>
                              {t("accountRestrictions.rejectBid")}
                            </Button>
                          </div>
                        ) : null}
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="oh-sa-users-muted">{t("accountRestrictions.activity.empty")}</p>
                )}
              </section>

              <section className="oh-sa-users-gates" aria-label={t("accountRestrictions.sections.audit")}>
                <div className="oh-sa-users-gates__head">
                  <h3>{t("accountRestrictions.sections.audit")}</h3>
                </div>
                {audit?.length ? (
                  <ul className="oh-sa-users-audit">
                    {audit.map((ev) => (
                      <li key={ev.id || `${ev.action}-${ev.createdAt}`}>
                        <div className="oh-sa-users-audit__top">
                          <strong>{ev.action}</strong>
                          <span>{formatLocaleDateTime(ev.createdAt, locale)}</span>
                        </div>
                        <p>{ev.reason || "—"}</p>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="oh-sa-users-muted">—</p>
                )}
              </section>
            </div>
          ) : null}
        </div>
      </aside>
    </div>
  );
}

function AddRestrictionDrawer({
  open,
  onClose,
  busy,
  form,
  setForm,
  scopeMode,
  setScopeMode,
  durationId,
  setDurationId,
  customExpires,
  setCustomExpires,
  selectedUser,
  setSelectedUser,
  userSearch,
  setUserSearch,
  searchResults,
  searching,
  onPickUser,
  onSubmit,
  prefillLoading,
}) {
  const { t } = useTranslation();
  if (!open) return null;

  const toggleCustomScope = (scope) => {
    setForm((prev) => {
      const current = (prev.scopes || []).filter((s) => s !== "ALL_MARKETPLACE");
      const next = current.includes(scope) ? current.filter((s) => s !== scope) : [...current, scope];
      return { ...prev, scopes: next.length ? next : ["bids"] };
    });
  };

  return (
    <div className="oh-sa-users-drawer" role="dialog" aria-modal="true" aria-labelledby="oh-sa-restr-add-title">
      <button
        type="button"
        className="oh-sa-users-drawer__backdrop"
        aria-label={t("accountRestrictions.form.close")}
        onClick={busy ? undefined : onClose}
      />
      <aside className="oh-sa-users-drawer__panel">
        <header className="oh-sa-users-drawer__header">
          <div>
            <h2 id="oh-sa-restr-add-title">{t("accountRestrictions.addWorkflow.title")}</h2>
            <p className="oh-sa-users-drawer__sub">{t("accountRestrictions.privacyNote")}</p>
          </div>
          <button type="button" className="oh-sa-users-drawer__close" onClick={onClose} disabled={busy} aria-label={t("accountRestrictions.form.close")}>
            ×
          </button>
        </header>
        <div className="oh-sa-users-drawer__body">
          {prefillLoading ? <DashboardLoadingState /> : null}

          {!selectedUser ? (
            <div className="oh-sa-users-stack">
              <label className="oh-sa-users-field">
                <span>{t("accountRestrictions.addWorkflow.searchLabel")}</span>
                <input
                  value={userSearch}
                  onChange={(e) => setUserSearch(e.target.value)}
                  placeholder={t("accountRestrictions.addWorkflow.searchPlaceholder")}
                  disabled={busy}
                />
              </label>
              {searching ? <DashboardLoadingState /> : null}
              {!searching && userSearch.trim() && !searchResults.length ? (
                <p className="oh-sa-users-muted">{t("accountRestrictions.addWorkflow.noResults")}</p>
              ) : null}
              <div className="oh-sa-restr-search-results">
                {searchResults.map((u) => (
                  <button key={u.id} type="button" className="oh-sa-restr-search-result" onClick={() => onPickUser(u)}>
                    <PersonCell name={u.fullName} sub={u.email} avatarUrl={u.avatarUrl} />
                    <span className="oh-sa-users-cell-sub" dir="ltr">
                      #{u.id}
                    </span>
                  </button>
                ))}
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
                  <h3>{t("accountRestrictions.sections.user")}</h3>
                  <Button type="button" variant="secondary" onClick={() => setSelectedUser(null)} disabled={busy}>
                    {t("accountRestrictions.addWorkflow.changeUser")}
                  </Button>
                </div>
                <PersonCell name={selectedUser.fullName} sub={selectedUser.email} avatarUrl={selectedUser.avatarUrl} />
                <div className="oh-sa-users-kv" style={{ marginTop: 12 }}>
                  <div>
                    <span>{t("accountRestrictions.columns.userId")}</span>
                    <strong dir="ltr">{selectedUser.id}</strong>
                  </div>
                  <div>
                    <span>{t("accountRestrictions.columns.plan")}</span>
                    <strong>{selectedUser.planTitle || selectedUser.membershipTier || "—"}</strong>
                  </div>
                  <div>
                    <span>{t("accountRestrictions.identity")}</span>
                    <strong>{selectedUser.identityStatus || "—"}</strong>
                  </div>
                  {selectedUser.hasActiveRestriction ? (
                    <div>
                      <span>{t("accountRestrictions.drawerTitle")}</span>
                      <strong>{t("accountRestrictions.addWorkflow.hasActive")}</strong>
                    </div>
                  ) : null}
                </div>
              </section>

              <label className="oh-sa-users-field">
                <span>{t("accountRestrictions.restrictionTypeLabel")}</span>
                <input value={t("accountRestrictions.restrictionTypeLabel")} disabled readOnly />
              </label>

              <fieldset className="oh-sa-users-field">
                <span>{t("accountRestrictions.scopes")}</span>
                <div className="oh-sa-restr-radio-row">
                  <label className="oh-sa-restr-radio">
                    <input
                      type="radio"
                      name="scopeMode"
                      checked={scopeMode === "all"}
                      onChange={() => {
                        setScopeMode("all");
                        setForm((p) => ({ ...p, scopes: ["ALL_MARKETPLACE"] }));
                      }}
                      disabled={busy}
                    />
                    {t("accountRestrictions.scopeMode.all")}
                  </label>
                  <label className="oh-sa-restr-radio">
                    <input
                      type="radio"
                      name="scopeMode"
                      checked={scopeMode === "custom"}
                      onChange={() => {
                        setScopeMode("custom");
                        setForm((p) => ({
                          ...p,
                          scopes: (p.scopes || []).includes("ALL_MARKETPLACE") ? ["bids"] : p.scopes,
                        }));
                      }}
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
                          checked={(form.scopes || []).includes(scope)}
                          onChange={() => toggleCustomScope(scope)}
                          disabled={busy}
                        />
                        {t(`accountRestrictions.scopesLabels.${scope}`)}
                      </label>
                    ))}
                  </div>
                ) : null}
              </fieldset>

              <label className="oh-sa-users-field">
                <span>{t("accountRestrictions.duration.label")}</span>
                <select value={durationId} onChange={(e) => setDurationId(e.target.value)} disabled={busy}>
                  {DURATION_OPTIONS.map((opt) => (
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

              <div className="oh-sa-users-actions-row oh-sa-users-actions-row--primary">
                <Button type="button" variant="secondary" onClick={onClose} disabled={busy}>
                  {t("accountRestrictions.form.cancel")}
                </Button>
                <Button type="submit" disabled={busy}>
                  {busy ? t("accountRestrictions.form.working") : t("accountRestrictions.addRestriction")}
                </Button>
              </div>
            </form>
          )}
        </div>
      </aside>
    </div>
  );
}

export default function SuperAdminAccountRestrictionsPage() {
  const { t, locale } = useTranslation();
  const { push } = useToast();
  const [searchParams, setSearchParams] = useSearchParams();

  const [primaryTab, setPrimaryTab] = useState("users");
  const [activeTab, setActiveTab] = useState("ACTIVE");
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchInput, setSearchInput] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const searchInputRef = useRef(null);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [total, setTotal] = useState(0);
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [rowMenuId, setRowMenuId] = useState(null);
  const [busy, setBusy] = useState(false);

  const [addOpen, setAddOpen] = useState(false);
  const [prefillLoading, setPrefillLoading] = useState(false);
  const [selectedUser, setSelectedUser] = useState(null);
  const [userSearch, setUserSearch] = useState("");
  const [searchResults, setSearchResults] = useState([]);
  const [searching, setSearching] = useState(false);
  const [scopeMode, setScopeMode] = useState("all");
  const [durationId, setDurationId] = useState("d7");
  const [customExpires, setCustomExpires] = useState("");
  const [form, setForm] = useState({
    scopes: ["ALL_MARKETPLACE"],
    internalReason: "",
    internalNote: "",
  });
  const [confirmAddOpen, setConfirmAddOpen] = useState(false);

  const [detailRow, setDetailRow] = useState(null);
  const [detailAudit, setDetailAudit] = useState([]);
  const [detailHeld, setDetailHeld] = useState([]);
  const [detailInherited, setDetailInherited] = useState([]);
  const [detailLoading, setDetailLoading] = useState(false);

  const [editRow, setEditRow] = useState(null);
  const [extendRow, setExtendRow] = useState(null);
  const [revokeRow, setRevokeRow] = useState(null);
  const [revokeReason, setRevokeReason] = useState("");
  const [extendDurationId, setExtendDurationId] = useState("d7");
  const [extendCustom, setExtendCustom] = useState("");
  const [editScopeMode, setEditScopeMode] = useState("all");
  const [editScopes, setEditScopes] = useState(["ALL_MARKETPLACE"]);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const params = {
        limit: PAGE_SIZE,
        offset: (page - 1) * PAGE_SIZE,
      };
      if (activeTab !== "ALL") params.status = activeTab;
      if (searchQuery) params.q = searchQuery;
      const res = await listSuperAdminAccountRestrictionsRequest(params);
      const list = res?.data?.items || [];
      const count = Number(res?.data?.total || 0);
      setItems(list);
      setTotal(count);
      setTotalPages(Math.max(1, Math.ceil(count / PAGE_SIZE)));
      setRowMenuId(null);
    } catch (err) {
      setError(errorMessage(err, t, locale));
      setItems([]);
    } finally {
      setLoading(false);
    }
  }, [activeTab, page, searchQuery, t, locale]);

  useEffect(() => {
    if (primaryTab !== "users") return;
    void load();
  }, [load, primaryTab]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      const next = searchInput.trim();
      if (next === searchQuery) return;
      setPage(1);
      setSearchQuery(next);
    }, SEARCH_DEBOUNCE_MS);
    return () => window.clearTimeout(timer);
  }, [searchInput, searchQuery]);

  useEffect(() => {
    if (searchOpen) searchInputRef.current?.focus();
  }, [searchOpen]);

  useEffect(() => {
    if (!addOpen || selectedUser || !userSearch.trim()) {
      setSearchResults([]);
      return undefined;
    }
    const timer = window.setTimeout(async () => {
      setSearching(true);
      try {
        const res = await listSuperAdminUsersRequest({
          q: userSearch.trim(),
          role: "freelancer",
          page: 1,
          limit: 12,
        });
        setSearchResults(res?.data?.items || []);
      } catch {
        setSearchResults([]);
      } finally {
        setSearching(false);
      }
    }, SEARCH_DEBOUNCE_MS);
    return () => window.clearTimeout(timer);
  }, [addOpen, selectedUser, userSearch]);

  const openAdd = useCallback(() => {
    setAddOpen(true);
    setSelectedUser(null);
    setUserSearch("");
    setSearchResults([]);
    setScopeMode("all");
    setDurationId("d7");
    setCustomExpires("");
    setForm({ scopes: ["ALL_MARKETPLACE"], internalReason: "", internalNote: "" });
  }, []);

  const pickUser = useCallback(async (user) => {
    setPrefillLoading(true);
    try {
      const [detailRes, restrRes] = await Promise.all([
        getSuperAdminUserDetailRequest(user.id).catch(() => null),
        getSuperAdminUserAccountRestrictionsRequest(user.id).catch(() => null),
      ]);
      const profile = detailRes?.data?.profile || user;
      const subscription = detailRes?.data?.subscription;
      setSelectedUser({
        id: String(user.id),
        fullName: profile.fullName || user.fullName,
        email: profile.email || user.email,
        avatarUrl: user.avatarUrl,
        membershipTier: user.membershipTier,
        planTitle: subscription?.planTitle || subscription?.planName || user.membershipTier,
        identityStatus: detailRes?.data?.identity?.status || user.identityStatus,
        hasActiveRestriction: Boolean(restrRes?.data?.hasActiveRestriction),
      });
    } finally {
      setPrefillLoading(false);
    }
  }, []);

  // Deep-link from Users drawer: ?add=1&userId=
  useEffect(() => {
    const add = searchParams.get("add");
    const userId = searchParams.get("userId");
    if (add !== "1" || !userId) return;
    openAdd();
    void (async () => {
      try {
        const res = await listSuperAdminUsersRequest({ q: String(userId), role: "freelancer", page: 1, limit: 5 });
        const match = (res?.data?.items || []).find((u) => String(u.id) === String(userId));
        if (match) await pickUser(match);
        else {
          setSelectedUser({
            id: String(userId),
            fullName: `#${userId}`,
            email: "",
          });
        }
      } catch {
        setSelectedUser({ id: String(userId), fullName: `#${userId}`, email: "" });
      } finally {
        setSearchParams({}, { replace: true });
      }
    })();
  }, [searchParams, setSearchParams, openAdd, pickUser]);

  const openDetails = async (row) => {
    setDetailRow(row);
    setDetailLoading(true);
    try {
      const [summary, held] = await Promise.all([
        getSuperAdminUserAccountRestrictionsRequest(row.userId),
        listSuperAdminHeldBidsRequest({ userId: row.userId, limit: 30 }),
      ]);
      setDetailAudit(summary?.data?.audit || []);
      setDetailHeld(held?.data?.items || []);
      setDetailInherited(summary?.data?.inheritedPlanRestrictions || []);
    } catch {
      setDetailAudit([]);
      setDetailHeld([]);
      setDetailInherited([]);
    } finally {
      setDetailLoading(false);
    }
  };

  const submitCreate = async () => {
    if (!selectedUser?.id) return;
    const reason = String(form.internalReason || "").trim();
    if (reason.length < 3) {
      push({ type: "error", message: t("accountRestrictions.form.reasonRequired") });
      return;
    }
    setBusy(true);
    try {
      await createSuperAdminAccountRestrictionRequest({
        userId: Number(selectedUser.id),
        restrictionType: "ACCOUNT_REVIEW_HOLD",
        scopes: scopeMode === "all" ? ["ALL_MARKETPLACE"] : form.scopes,
        internalReason: reason,
        internalNote: form.internalNote?.trim() || null,
        expiresAt: expiresAtFromDuration(durationId, customExpires),
      });
      push({ type: "success", message: t("accountRestrictions.saveOk") });
      setConfirmAddOpen(false);
      setAddOpen(false);
      setActiveTab("ACTIVE");
      setPage(1);
      await load();
    } catch (err) {
      push({ type: "error", message: errorMessage(err, t, locale) });
    } finally {
      setBusy(false);
    }
  };

  const submitRevoke = async () => {
    if (!revokeRow) return;
    setBusy(true);
    try {
      await revokeSuperAdminAccountRestrictionRequest(revokeRow.id, {
        revokeReason: revokeReason.trim() || null,
      });
      push({ type: "success", message: t("accountRestrictions.revokeOk") });
      setRevokeRow(null);
      setRevokeReason("");
      await load();
    } catch (err) {
      push({ type: "error", message: errorMessage(err, t, locale) });
    } finally {
      setBusy(false);
    }
  };

  const submitExtend = async () => {
    if (!extendRow) return;
    const expiresAt = expiresAtFromDuration(extendDurationId, extendCustom);
    if (!expiresAt) {
      push({ type: "error", message: t("accountRestrictions.columns.expiresAt") });
      return;
    }
    setBusy(true);
    try {
      await extendSuperAdminAccountRestrictionRequest(extendRow.id, { expiresAt });
      push({ type: "success", message: t("accountRestrictions.extendOk") });
      setExtendRow(null);
      await load();
    } catch (err) {
      push({ type: "error", message: errorMessage(err, t, locale) });
    } finally {
      setBusy(false);
    }
  };

  const submitEdit = async () => {
    if (!editRow) return;
    setBusy(true);
    try {
      await updateSuperAdminAccountRestrictionRequest(editRow.id, {
        scopes: editScopeMode === "all" ? ["ALL_MARKETPLACE"] : editScopes,
      });
      push({ type: "success", message: t("accountRestrictions.updateOk") });
      setEditRow(null);
      await load();
    } catch (err) {
      push({ type: "error", message: errorMessage(err, t, locale) });
    } finally {
      setBusy(false);
    }
  };

  const actionsFor = (row) => {
    const active = row.status === "ACTIVE";
    if (active) {
      return [
        { key: "details", label: t("accountRestrictions.viewDetails"), onClick: () => openDetails(row) },
        {
          key: "edit",
          label: t("accountRestrictions.edit"),
          onClick: () => {
            setEditRow(row);
            const all = (row.scopes || []).includes("ALL_MARKETPLACE");
            setEditScopeMode(all ? "all" : "custom");
            setEditScopes(all ? ["ALL_MARKETPLACE"] : row.scopes || ["bids"]);
          },
        },
        {
          key: "extend",
          label: t("accountRestrictions.extend"),
          onClick: () => {
            setExtendRow(row);
            setExtendDurationId("d7");
            setExtendCustom("");
          },
        },
        {
          key: "revoke",
          label: t("accountRestrictions.revoke"),
          danger: true,
          onClick: () => {
            setRevokeRow(row);
            setRevokeReason("");
          },
        },
        { key: "log", label: t("accountRestrictions.viewHistory"), onClick: () => openDetails(row) },
      ];
    }
    return [
      { key: "details", label: t("accountRestrictions.viewDetails"), onClick: () => openDetails(row) },
      { key: "log", label: t("accountRestrictions.viewLog"), onClick: () => openDetails(row) },
      {
        key: "again",
        label: t("accountRestrictions.restrictAgain"),
        onClick: () => {
          openAdd();
          void pickUser({
            id: row.userId,
            fullName: row.userName,
            email: row.userEmail,
            membershipTier: row.planTitle,
          });
        },
      },
    ];
  };

  return (
    <DashboardShell>
      <DashboardSection className="oh-sa-users-list-section">
        <div
          className="oh-sa-users-toolbar__tabs"
          role="tablist"
          aria-label={t("accountRestrictions.primaryTabs.aria")}
          style={{ marginBottom: 12 }}
        >
          {PRIMARY_TABS.map((tab) => {
            const isActive = primaryTab === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                role="tab"
                aria-selected={isActive}
                className={`oh-sa-users-tab${isActive ? " is-active" : ""}`}
                onClick={() => {
                  if (tab.id === primaryTab) return;
                  setPrimaryTab(tab.id);
                  setRowMenuId(null);
                }}
              >
                <span className="oh-sa-users-tab__label">{t(tab.labelKey)}</span>
              </button>
            );
          })}
        </div>

        {primaryTab === "plans" ? (
          <SuperAdminAccountRestrictionsPlansPanel />
        ) : (
          <>
        <header className="oh-sa-users-list-head">
          <div className="oh-sa-users-list-head__top">
            <div className="oh-sa-users-list-head__titles">
              <h2 className="oh-sa-users-list-head__title">{t("accountRestrictions.listTitle")}</h2>
              <p className="oh-sa-users-list-head__desc">
                {t("accountRestrictions.listCount", { count: formatCount(total) })}
              </p>
            </div>
            <div className="oh-sa-users-list-head__actions">
              <div className={`oh-sa-users-toolbar__search${searchOpen ? " is-open" : ""}`}>
                {searchOpen ? (
                  <>
                    <Search size={16} strokeWidth={2} className="oh-sa-users-toolbar__search-glyph" aria-hidden />
                    <input
                      ref={searchInputRef}
                      value={searchInput}
                      onChange={(e) => setSearchInput(e.target.value)}
                      placeholder={t("accountRestrictions.searchPlaceholder")}
                      aria-label={t("accountRestrictions.searchPlaceholder")}
                    />
                    <button
                      type="button"
                      className="oh-sa-users-toolbar__search-clear"
                      aria-label={t("accountRestrictions.form.close")}
                      onClick={() => {
                        setSearchOpen(false);
                        if (searchInput.trim()) {
                          setSearchInput("");
                          setSearchQuery("");
                          setPage(1);
                        }
                      }}
                    >
                      <X size={14} strokeWidth={2.25} aria-hidden />
                    </button>
                  </>
                ) : (
                  <button
                    type="button"
                    className="oh-sa-users-toolbar__search-btn"
                    aria-label={t("accountRestrictions.searchPlaceholder")}
                    onClick={() => setSearchOpen(true)}
                  >
                    <Search size={18} strokeWidth={2.25} aria-hidden />
                  </button>
                )}
              </div>
              <Button type="button" onClick={openAdd}>
                {t("accountRestrictions.addUser")}
              </Button>
            </div>
          </div>

          <div className="oh-sa-users-toolbar__tabs" role="tablist" aria-label={t("accountRestrictions.filterAria")}>
            {FILTER_TABS.map((tab) => {
              const isActive = activeTab === tab.id;
              return (
                <button
                  key={tab.id}
                  type="button"
                  role="tab"
                  aria-selected={isActive}
                  className={`oh-sa-users-tab${isActive ? " is-active" : ""}`}
                  onClick={() => {
                    if (tab.id === activeTab) return;
                    setActiveTab(tab.id);
                    setPage(1);
                  }}
                >
                  <span className="oh-sa-users-tab__label">{t(tab.labelKey)}</span>
                </button>
              );
            })}
          </div>
        </header>

        {error ? <DashboardErrorState title={error} /> : null}
        {loading ? <DashboardLoadingState /> : null}
        {!loading && !error && items.length === 0 ? (
          <DashboardEmptyState
            title={t("accountRestrictions.emptyTitle")}
            description={t("accountRestrictions.emptyDescription")}
            actions={
              <Button type="button" onClick={openAdd}>
                {t("accountRestrictions.addUser")}
              </Button>
            }
          />
        ) : null}

        {!loading && !error && items.length > 0 ? (
          <>
            <div className="oh-sa-users-table-wrap oh-sa-users-table-wrap--airy">
              <table className="oh-sa-users-table oh-sa-users-table--airy">
                <thead>
                  <tr>
                    <th className="oh-sa-users-col oh-sa-users-col--user">{t("accountRestrictions.columns.user")}</th>
                    <th className="oh-sa-users-col oh-sa-restr-col--userId">{t("accountRestrictions.columns.userId")}</th>
                    <th className="oh-sa-users-col oh-sa-restr-col--email">{t("accountRestrictions.columns.email")}</th>
                    <th className="oh-sa-users-col oh-sa-restr-col--plan">{t("accountRestrictions.columns.plan")}</th>
                    <th className="oh-sa-users-col">{t("accountRestrictions.columns.status")}</th>
                    <th className="oh-sa-users-col">{t("accountRestrictions.columns.scope")}</th>
                    <th className="oh-sa-users-col oh-sa-restr-col--addedAt">{t("accountRestrictions.columns.addedAt")}</th>
                    <th className="oh-sa-users-col oh-sa-restr-col--expires">{t("accountRestrictions.columns.expiresAt")}</th>
                    <th className="oh-sa-users-col oh-sa-restr-col--addedBy">{t("accountRestrictions.columns.addedBy")}</th>
                    <th className="oh-sa-users-col oh-sa-users-col--actions">{t("accountRestrictions.columns.actions")}</th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((row) => {
                    const id = String(row.id);
                    return (
                      <tr key={id} onDoubleClick={() => openDetails(row)} style={{ cursor: "pointer" }}>
                        <td className="oh-sa-users-col oh-sa-users-col--user">
                          <PersonCell name={row.userName} sub={row.userEmail} />
                        </td>
                        <td className="oh-sa-users-col oh-sa-restr-col--userId">
                          <span className="oh-sa-users-cell-primary" dir="ltr">
                            {row.userId}
                          </span>
                        </td>
                        <td className="oh-sa-users-col oh-sa-restr-col--email">
                          <span className="oh-sa-users-cell-sub" dir="ltr">
                            {row.userEmail || "—"}
                          </span>
                        </td>
                        <td className="oh-sa-users-col oh-sa-restr-col--plan">
                          <span className="oh-sa-users-cell-primary">{row.planTitle || "—"}</span>
                        </td>
                        <td className="oh-sa-users-col">
                          <StatusBadge tone={statusTone(row.status)} className="oh-sa-users-pill">
                            {statusLabel(t, row.status)}
                          </StatusBadge>
                        </td>
                        <td className="oh-sa-users-col">
                          <div className="oh-sa-restr-scope-pills">
                            {scopeLabels(t, row.scopes).map((label) => (
                              <span key={label} className="oh-sa-restr-scope-pill">
                                {label}
                              </span>
                            ))}
                          </div>
                        </td>
                        <td className="oh-sa-users-col oh-sa-restr-col--addedAt">
                          <span className="oh-sa-users-cell-sub">
                            {formatLocaleDate(row.createdAt || row.startsAt, locale)}
                          </span>
                        </td>
                        <td className="oh-sa-users-col oh-sa-restr-col--expires">
                          <span className="oh-sa-users-cell-sub">
                            {row.expiresAt ? formatLocaleDate(row.expiresAt, locale) : t("accountRestrictions.noExpiry")}
                          </span>
                        </td>
                        <td className="oh-sa-users-col oh-sa-restr-col--addedBy">
                          <span className="oh-sa-users-cell-sub">{row.createdByName || row.createdByAdminId || "—"}</span>
                        </td>
                        <td className="oh-sa-users-col oh-sa-users-col--actions">
                          <RowActionsMenu
                            open={rowMenuId === id}
                            onOpenChange={(next) => setRowMenuId(next ? id : null)}
                            label={t("accountRestrictions.actionsFor", {
                              name: row.userName || row.userEmail || row.userId,
                            })}
                            items={actionsFor(row)}
                          />
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <div className="oh-sa-users-pagination">
              <Pagination currentPage={page} totalPages={totalPages} onPageChange={setPage} isLoading={loading} />
            </div>
          </>
        ) : null}
          </>
        )}
      </DashboardSection>

      <AddRestrictionDrawer
        open={addOpen}
        onClose={() => setAddOpen(false)}
        busy={busy}
        form={form}
        setForm={setForm}
        scopeMode={scopeMode}
        setScopeMode={setScopeMode}
        durationId={durationId}
        setDurationId={setDurationId}
        customExpires={customExpires}
        setCustomExpires={setCustomExpires}
        selectedUser={selectedUser}
        setSelectedUser={setSelectedUser}
        userSearch={userSearch}
        setUserSearch={setUserSearch}
        searchResults={searchResults}
        searching={searching}
        onPickUser={pickUser}
        onSubmit={() => setConfirmAddOpen(true)}
        prefillLoading={prefillLoading}
      />

      <RestrictionDetailsDrawer
        open={Boolean(detailRow)}
        row={detailRow}
        audit={detailAudit}
        heldBids={detailHeld}
        inheritedPlanRestrictions={detailInherited}
        loading={detailLoading}
        onClose={() => setDetailRow(null)}
        busy={busy}
        onReleaseBid={async (bidId) => {
          setBusy(true);
          try {
            await releaseSuperAdminHeldBidRequest(bidId);
            push({ type: "success", message: t("accountRestrictions.releaseBid") });
            const held = await listSuperAdminHeldBidsRequest({ userId: detailRow.userId, limit: 30 });
            setDetailHeld(held?.data?.items || []);
          } catch (err) {
            push({ type: "error", message: errorMessage(err, t, locale) });
          } finally {
            setBusy(false);
          }
        }}
        onRejectBid={async (bidId) => {
          setBusy(true);
          try {
            await rejectSuperAdminHeldBidRequest(bidId);
            push({ type: "success", message: t("accountRestrictions.rejectBid") });
            const held = await listSuperAdminHeldBidsRequest({ userId: detailRow.userId, limit: 30 });
            setDetailHeld(held?.data?.items || []);
          } catch (err) {
            push({ type: "error", message: errorMessage(err, t, locale) });
          } finally {
            setBusy(false);
          }
        }}
      />

      <ConfirmDialog
        open={confirmAddOpen}
        title={t("accountRestrictions.addWorkflow.confirmTitle")}
        body={t("accountRestrictions.addWorkflow.confirmBody")}
        confirmLabel={t("accountRestrictions.addWorkflow.confirmAdd")}
        onCancel={() => setConfirmAddOpen(false)}
        onConfirm={() => void submitCreate()}
        confirmBusy={busy}
      />

      <ConfirmDialog
        open={Boolean(revokeRow)}
        title={t("accountRestrictions.revokeWorkflow.title")}
        body={
          <div className="oh-sa-users-stack">
            <p>{t("accountRestrictions.revokeWorkflow.description")}</p>
            <label className="oh-sa-users-field">
              <span>{t("accountRestrictions.revokeWorkflow.reasonOptional")}</span>
              <textarea value={revokeReason} onChange={(e) => setRevokeReason(e.target.value)} rows={2} />
            </label>
          </div>
        }
        confirmLabel={t("accountRestrictions.revokeWorkflow.confirm")}
        confirmVariant="danger"
        onCancel={() => setRevokeRow(null)}
        onConfirm={() => void submitRevoke()}
        confirmBusy={busy}
      />

      {extendRow ? (
        <div className="oh-sa-users-modal" role="dialog" aria-modal="true">
          <button type="button" className="oh-sa-users-modal__backdrop" onClick={() => setExtendRow(null)} />
          <div className="oh-sa-users-modal__panel">
            <header className="oh-sa-users-modal__header">
              <h2>{t("accountRestrictions.extendWorkflow.title")}</h2>
              <button type="button" className="oh-sa-users-modal__close" onClick={() => setExtendRow(null)}>
                ×
              </button>
            </header>
            <div className="oh-sa-users-modal__body">
              <label className="oh-sa-users-field">
                <span>{t("accountRestrictions.duration.label")}</span>
                <select value={extendDurationId} onChange={(e) => setExtendDurationId(e.target.value)}>
                  {DURATION_OPTIONS.filter((o) => o.id !== "none").map((opt) => (
                    <option key={opt.id} value={opt.id}>
                      {t(`accountRestrictions.duration.${opt.id}`)}
                    </option>
                  ))}
                </select>
              </label>
              {extendDurationId === "custom" ? (
                <label className="oh-sa-users-field">
                  <span>{t("accountRestrictions.columns.expiresAt")}</span>
                  <input type="datetime-local" value={extendCustom} onChange={(e) => setExtendCustom(e.target.value)} />
                </label>
              ) : null}
              <footer className="oh-sa-users-modal__footer">
                <Button type="button" variant="secondary" onClick={() => setExtendRow(null)}>
                  {t("accountRestrictions.form.cancel")}
                </Button>
                <Button type="button" onClick={() => void submitExtend()} disabled={busy}>
                  {t("accountRestrictions.extendWorkflow.confirm")}
                </Button>
              </footer>
            </div>
          </div>
        </div>
      ) : null}

      {editRow ? (
        <div className="oh-sa-users-modal" role="dialog" aria-modal="true">
          <button type="button" className="oh-sa-users-modal__backdrop" onClick={() => setEditRow(null)} />
          <div className="oh-sa-users-modal__panel">
            <header className="oh-sa-users-modal__header">
              <h2>{t("accountRestrictions.editWorkflow.title")}</h2>
              <button type="button" className="oh-sa-users-modal__close" onClick={() => setEditRow(null)}>
                ×
              </button>
            </header>
            <div className="oh-sa-users-modal__body">
              <div className="oh-sa-restr-radio-row">
                <label className="oh-sa-restr-radio">
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
                <label className="oh-sa-restr-radio">
                  <input
                    type="radio"
                    checked={editScopeMode === "custom"}
                    onChange={() => {
                      setEditScopeMode("custom");
                      setEditScopes((prev) => (prev.includes("ALL_MARKETPLACE") ? ["bids"] : prev));
                    }}
                  />
                  {t("accountRestrictions.scopeMode.custom")}
                </label>
              </div>
              {editScopeMode === "custom" ? (
                <div className="oh-sa-restr-custom-scopes">
                  {CUSTOM_SCOPES.map((scope) => (
                    <label key={scope} className="oh-sa-restr-radio">
                      <input
                        type="checkbox"
                        checked={editScopes.includes(scope)}
                        onChange={() =>
                          setEditScopes((prev) =>
                            prev.includes(scope) ? prev.filter((s) => s !== scope) : [...prev.filter((s) => s !== "ALL_MARKETPLACE"), scope],
                          )
                        }
                      />
                      {t(`accountRestrictions.scopesLabels.${scope}`)}
                    </label>
                  ))}
                </div>
              ) : null}
              <footer className="oh-sa-users-modal__footer">
                <Button type="button" variant="secondary" onClick={() => setEditRow(null)}>
                  {t("accountRestrictions.form.cancel")}
                </Button>
                <Button type="button" onClick={() => void submitEdit()} disabled={busy}>
                  {t("accountRestrictions.editWorkflow.confirm")}
                </Button>
              </footer>
            </div>
          </div>
        </div>
      ) : null}
    </DashboardShell>
  );
}
