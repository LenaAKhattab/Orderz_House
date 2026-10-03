import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Link } from "react-router-dom";
import { MoreVertical, Search, X } from "lucide-react";
import Button from "../../components/ui/Button";
import DashboardShell from "../../components/dashboard/DashboardShell";
import DashboardSection from "../../components/dashboard/DashboardSection";
import DashboardEmptyState from "../../components/dashboard/DashboardEmptyState";
import DashboardLoadingState from "../../components/dashboard/DashboardLoadingState";
import DashboardErrorState from "../../components/dashboard/DashboardErrorState";
import StatusBadge from "../../components/dashboard/StatusBadge";
import Pagination from "../../components/common/Pagination";
import { useToast } from "../../components/ui/toastContext";
import {
  getSuperAdminUsersStatsRequest,
  listSuperAdminUsersRequest,
  getSuperAdminUserDetailRequest,
  getSuperAdminUserAccountRestrictionsRequest,
  patchSuperAdminUserAccountRequest,
  patchSuperAdminUserIdentityRequest,
  patchSuperAdminUserMembershipRequest,
  patchSuperAdminUserTrainingRequest,
  postSuperAdminUsersBulkActionsRequest,
  listAdminPlansRequest,
} from "../../services/api";
import { membershipScheduleView } from "../../utils/membershipFirstOrderSchedule";
import { useTranslation } from "../../i18n/LanguageProvider";
import { durationMonthsText, formatLocaleDate, formatLocaleDateTime } from "../../i18n/formatLocale";
import { presentServerMessage } from "../../i18n/presentServerMessage";
import "../../i18n/accountRestrictionsResources";
import "./superAdminUsersPage.css";

const PAGE_SIZE = 20;
const SEARCH_DEBOUNCE_MS = 350;

const FILTER_TABS = [
  { id: "all", labelKey: "users.tabs.all", countKey: "totals", params: {} },
  { id: "freelancers", labelKey: "users.tabs.freelancers", countKey: "freelancers", params: { role: "freelancer" } },
  { id: "clients", labelKey: "users.tabs.clients", countKey: "clients", params: { role: "client" } },
  {
    id: "pending_activation",
    labelKey: "users.tabs.pendingActivation",
    countKey: "pendingActivation",
    params: { activationStatus: "company_pending" },
  },
  {
    id: "identity_review",
    labelKey: "users.tabs.identityReview",
    countKey: "identityPendingReview",
    params: { identityStatus: "pending_review" },
  },
  {
    id: "final_test",
    labelKey: "users.tabs.finalTest",
    countKey: "pendingFinalTests",
    params: { hasPendingFinalTest: true },
  },
];

const DETAIL_TABS = [
  { id: "overview", labelKey: "users.tabs.overview" },
  { id: "identity", labelKey: "users.tabs.identity" },
  { id: "plan", labelKey: "users.tabs.plan" },
  { id: "courses", labelKey: "users.tabs.courses" },
  { id: "activity", labelKey: "users.tabs.activity" },
  { id: "audit", labelKey: "users.tabs.audit" },
];

const IDENTITY_METHOD_OPTIONS = ["whatsapp", "in_person", "email", "company_docs", "other"];
const COURSE_REASON_OPTIONS = ["external_training", "manual_verification", "company_record", "admin_decision", "other"];
const PACKAGE_DURATION_OPTIONS = ["1", "3", "4", "6", "12", "custom"];

function errorMessage(err, t, locale) {
  return presentServerMessage(err, t, locale);
}

function dictLabel(t, group, value) {
  if (value == null || value === "") return "—";
  const key = `users.${group}.${value}`;
  const text = t(key);
  return text === key ? String(value) : text;
}

function roleLabel(t, role) {
  return dictLabel(t, "roles", role);
}

function accountLabel(t, status) {
  return dictLabel(t, "accountStatus", status);
}

function identityLabel(t, status) {
  return dictLabel(t, "identityStatus", status);
}

function courseLabel(t, status) {
  return dictLabel(t, "courseStatus", status);
}

function subscriptionStatusLabel(t, status) {
  if (!status) return "—";
  return dictLabel(t, "subscriptionStatus", String(status).toLowerCase());
}

function activationStatusLabel(t, status) {
  if (!status) return "—";
  return dictLabel(t, "activationStatus", String(status).toLowerCase());
}

function subscriptionSourceLabel(t, source) {
  if (!source) return null;
  const key = `users.sources.${String(source).toLowerCase()}`;
  const text = t(key);
  return text === key ? null : text;
}

function membershipLabel(t, status) {
  if (!status) return t("users.noPlan");
  return subscriptionStatusLabel(t, status);
}

function localizeBlocker(t, blocker, gates) {
  if (blocker?.code === "package") {
    const reason = gates?.find((gate) => gate.code === "package")?.reason;
    if (reason) {
      const key = `users.blockers.package.${reason}`;
      const text = t(key);
      if (text !== key) return text;
    }
    return t("users.blockers.package.generic");
  }
  const key = `users.blockers.${blocker?.code || "generic"}`;
  const text = t(key);
  return text === key ? t("users.blockers.generic") : text;
}

function toneForAccount(status) {
  return status === "active" ? "success" : status === "inactive" ? "inactive" : "neutral";
}

function toneForIdentity(status) {
  if (status === "approved") return "success";
  if (status === "pending_review") return "pending";
  if (status === "rejected") return "danger";
  return "neutral";
}

function toneForCourse(status) {
  if (status === "completed") return "success";
  if (status === "pending_final_test") return "warning";
  if (status === "in_progress") return "pending";
  return "neutral";
}

function downloadCsv(csvText, filename) {
  const blob = new Blob(["\uFEFF" + String(csvText || "")], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

function openProtectedPath(protectedPath) {
  const path = String(protectedPath || "").trim();
  if (!path || !path.startsWith("/")) return;
  window.open(path, "_blank", "noopener,noreferrer");
}

function ReasonModal({
  open,
  title,
  description,
  confirmLabel,
  danger = false,
  busy = false,
  extra = null,
  selectLabel = null,
  selectOptions = null,
  checkboxLabel = null,
  noteLabel = null,
  onClose,
  onConfirm,
}) {
  const { t } = useTranslation();
  const [reason, setReason] = useState("");
  const [method, setMethod] = useState("");
  const [checked, setChecked] = useState(false);
  const [localError, setLocalError] = useState("");
  const structured = Array.isArray(selectOptions) && selectOptions.length > 0;

  useEffect(() => {
    if (!open) return;
    setReason("");
    setMethod(selectOptions?.[0]?.value || "");
    setChecked(false);
    setLocalError("");
  }, [open, selectOptions]);

  if (!open) return null;

  const submit = async (e) => {
    e.preventDefault();
    const trimmed = reason.trim();
    if (checkboxLabel && !checked) {
      setLocalError(t("users.confirmNeeded"));
      return;
    }
    if (structured) {
      if (!method) {
        setLocalError(t("users.selectionRequired", { label: selectLabel || t("users.selectionFallback") }));
        return;
      }
      const composed = trimmed.length >= 3 ? trimmed : `${selectLabel || t("users.approvalFallback")}: ${method}`;
      setLocalError("");
      await onConfirm({ reason: composed, method, note: trimmed });
      return;
    }
    if (trimmed.length < 3) {
      setLocalError(t("users.reasonRequired"));
      return;
    }
    setLocalError("");
    await onConfirm(trimmed);
  };

  return (
    <div className="oh-sa-users-modal" role="dialog" aria-modal="true" aria-labelledby="oh-sa-users-reason-title">
      <button type="button" className="oh-sa-users-modal__backdrop" aria-label={t("users.close")} onClick={busy ? undefined : onClose} />
      <div className="oh-sa-users-modal__panel">
        <header className="oh-sa-users-modal__header">
          <h2 id="oh-sa-users-reason-title">{title}</h2>
          <button type="button" className="oh-sa-users-modal__close" onClick={onClose} disabled={busy} aria-label={t("users.close")}>
            ×
          </button>
        </header>
        <form className="oh-sa-users-modal__body" onSubmit={submit}>
          {description ? <p className="oh-sa-users-modal__desc">{description}</p> : null}
          {extra}
          {structured ? (
            <label className="oh-sa-users-field">
              <span>{selectLabel}</span>
              <select value={method} onChange={(e) => setMethod(e.target.value)} required disabled={busy}>
                {selectOptions.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </label>
          ) : null}
          <label className="oh-sa-users-field">
            <span>{structured ? noteLabel || t("users.note") : t("users.actionReason")}</span>
            <textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              rows={3}
              required={!structured}
              minLength={structured ? undefined : 3}
              maxLength={2000}
              placeholder={structured ? t("users.noteOptional") : t("users.reasonPlaceholder")}
              disabled={busy}
            />
          </label>
          {checkboxLabel ? (
            <label className="oh-sa-users-check">
              <input
                type="checkbox"
                checked={checked}
                onChange={(e) => setChecked(e.target.checked)}
                disabled={busy}
              />
              <span>{checkboxLabel}</span>
            </label>
          ) : null}
          {localError ? <div className="oh-sa-users-modal__error">{localError}</div> : null}
          <footer className="oh-sa-users-modal__footer">
            <Button type="button" variant="secondary" onClick={onClose} disabled={busy}>
              {t("users.cancel")}
            </Button>
            <Button type="submit" variant={danger ? "danger" : "primary"} disabled={busy}>
              {busy ? t("users.working") : confirmLabel || t("users.confirm")}
            </Button>
          </footer>
        </form>
      </div>
    </div>
  );
}

function formatCount(value) {
  return Number(value || 0).toLocaleString("en-US");
}

function UserRowActionsMenu({ user, open, onOpenChange, onEdit, onToggleStatus, onDelete }) {
  const { t } = useTranslation();
  const triggerRef = useRef(null);
  const panelRef = useRef(null);
  const [pos, setPos] = useState(null);
  const isActive = user.accountStatus === "active";

  useEffect(() => {
    if (!open) {
      setPos(null);
      return undefined;
    }
    const update = () => {
      const el = triggerRef.current;
      if (!el) return;
      const r = el.getBoundingClientRect();
      const width = 168;
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
      const t = e.target;
      if (triggerRef.current?.contains(t) || panelRef.current?.contains(t)) return;
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
          <div
            ref={panelRef}
            className="oh-sa-users-row-menu__panel"
            role="menu"
            style={{ top: pos.top, left: pos.left }}
          >
            <button
              type="button"
              role="menuitem"
              className="oh-sa-users-row-menu__item"
              onClick={() => {
                onOpenChange(false);
                onEdit();
              }}
            >
              {t("users.actions.edit")}
            </button>
            <button
              type="button"
              role="menuitem"
              className="oh-sa-users-row-menu__item"
              onClick={() => {
                onOpenChange(false);
                onToggleStatus();
              }}
            >
              {isActive ? t("users.actions.disable") : t("users.actions.enable")}
            </button>
            <button
              type="button"
              role="menuitem"
              className="oh-sa-users-row-menu__item oh-sa-users-row-menu__item--danger"
              onClick={() => {
                onOpenChange(false);
                onDelete();
              }}
            >
              {t("users.actions.delete")}
            </button>
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
        aria-label={t("users.actionsFor", { name: user.fullName || user.email || user.id })}
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

function UserDetailDrawer({
  open,
  loading,
  error,
  detail,
  plans,
  onClose,
  onReload,
  onAction,
}) {
  const { t, locale } = useTranslation();
  const [tab, setTab] = useState("overview");
  const [accountDraft, setAccountDraft] = useState({
    firstName: "",
    fatherName: "",
    familyName: "",
    phone: "",
    whatsapp: "",
  });
  const [planId, setPlanId] = useState("");
  const [durationChoice, setDurationChoice] = useState("1");
  const [customMonths, setCustomMonths] = useState("1");
  const [restrictionSummary, setRestrictionSummary] = useState(null);

  useEffect(() => {
    if (!open) return;
    setTab("overview");
  }, [open, detail?.profile?.id]);

  useEffect(() => {
    const userId = detail?.profile?.id;
    if (!open || !userId) {
      setRestrictionSummary(null);
      return undefined;
    }
    let cancelled = false;
    (async () => {
      try {
        const res = await getSuperAdminUserAccountRestrictionsRequest(userId);
        if (!cancelled) setRestrictionSummary(res?.data || null);
      } catch {
        if (!cancelled) setRestrictionSummary(null);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [open, detail?.profile?.id]);

  useEffect(() => {
    const p = detail?.profile;
    if (!p) return;
    setAccountDraft({
      firstName: p.firstName || "",
      fatherName: p.fatherName || "",
      familyName: p.familyName || "",
      phone: p.phone || "",
      whatsapp: p.whatsapp || "",
    });
    setPlanId(detail?.subscription?.planId || "");
    setDurationChoice("1");
    setCustomMonths("1");
  }, [detail]);

  if (!open) return null;

  const profile = detail?.profile;
  const identity = detail?.identity;
  const subscription = detail?.subscription;
  const schedule = membershipScheduleView(subscription, {
    waiting: t("users.schedule.waiting"),
    starts: t("users.schedule.starts"),
    expiry: t("users.schedule.expiry"),
    duration: (months) => durationMonthsText(t, months),
  });
  const training = detail?.training;
  const activity = detail?.activity;
  const auditEvents = detail?.auditEvents || [];
  const blockers = detail?.blockers || [];
  const orderReadiness = detail?.orderReadiness || null;
  const selectedDurationMonths = (() => {
    const raw = durationChoice === "custom" ? Number(customMonths) : Number(durationChoice);
    return Number.isInteger(raw) && raw >= 1 && raw <= 120 ? raw : null;
  })();

  return (
    <div className="oh-sa-users-drawer" role="dialog" aria-modal="true" aria-labelledby="oh-sa-users-drawer-title">
      <button type="button" className="oh-sa-users-drawer__backdrop" aria-label={t("users.close")} onClick={onClose} />
      <aside className="oh-sa-users-drawer__panel">
        <header className="oh-sa-users-drawer__header">
          <div>
            <h2 id="oh-sa-users-drawer-title">{profile?.fullName || profile?.email || t("users.detailsFallback")}</h2>
            {profile ? (
              <p className="oh-sa-users-drawer__sub" dir="ltr">
                {profile.email} · #{profile.id}
              </p>
            ) : null}
          </div>
          <button type="button" className="oh-sa-users-drawer__close" onClick={onClose} aria-label={t("users.close")}>
            ×
          </button>
        </header>

        <nav className="oh-sa-users-tabs" aria-label={t("users.sectionsAria")}>
          {DETAIL_TABS.map((item) => (
            <button
              key={item.id}
              type="button"
              className={`oh-sa-users-tabs__btn${tab === item.id ? " is-active" : ""}`}
              onClick={() => setTab(item.id)}
            >
              {t(item.labelKey)}
            </button>
          ))}
        </nav>

        <div className="oh-sa-users-drawer__body">
          {loading ? <DashboardLoadingState label={t("users.loadingDetails")} /> : null}
          {!loading && error ? <DashboardErrorState message={error} onRetry={onReload} /> : null}
          {!loading && !error && profile ? (
            <>
              {tab === "overview" ? (
                <div className="oh-sa-users-stack">
                  <div className="oh-sa-users-kv">
                    <div>
                      <span>{t("users.fields.role")}</span>
                      <strong>{roleLabel(t, profile.role)}</strong>
                    </div>
                    <div>
                      <span>{t("users.fields.account")}</span>
                      <StatusBadge tone={toneForAccount(profile.accountStatus)}>
                        {accountLabel(t, profile.accountStatus)}
                      </StatusBadge>
                    </div>
                    <div>
                      <span>{t("users.fields.phone")}</span>
                      <strong dir="ltr">{profile.phone || "—"}</strong>
                    </div>
                    <div>
                      <span>{t("users.fields.whatsapp")}</span>
                      <strong dir="ltr">{profile.whatsapp || "—"}</strong>
                    </div>
                    <div>
                      <span>{t("users.fields.created")}</span>
                      <strong>{formatLocaleDate(profile.createdAt, locale)}</strong>
                    </div>
                    <div>
                      <span>{t("users.fields.lastSeen")}</span>
                      <strong>{formatLocaleDateTime(profile.lastSeenAt, locale)}</strong>
                    </div>
                  </div>

                  {orderReadiness ? (
                    <section className="oh-sa-users-gates" aria-label={t("users.eligibility.title")}>
                      <div className="oh-sa-users-gates__head">
                        <h3>{t("users.eligibility.title")}</h3>
                        <StatusBadge tone={orderReadiness.eligible ? "success" : "danger"}>
                          {orderReadiness.eligible ? t("users.eligibility.eligible") : t("users.eligibility.ineligible")}
                        </StatusBadge>
                      </div>
                      <ul>
                        {(orderReadiness.gates || []).map((gate) => (
                          <li
                            key={gate.code}
                            className={
                              gate.state === "passed"
                                ? "oh-sa-users-gate--pass"
                                : gate.state === "failed"
                                  ? "oh-sa-users-gate--fail"
                                  : "oh-sa-users-gate--na"
                            }
                          >
                            {gate.state === "passed" ? "✓" : gate.state === "failed" ? "✕" : "–"} {dictLabel(t, "gates", gate.code)}
                            {gate.notApplicable ? ` — ${t("users.eligibility.notEnabled")}` : ""}
                            {gate.code === "final_exam" && gate.state === "failed"
                              ? ` — ${t("users.eligibility.examSeparate")}`
                              : ""}
                          </li>
                        ))}
                      </ul>
                    </section>
                  ) : null}

                  {blockers.length ? (
                    <div className="oh-sa-users-blockers">
                      <h3>{t("users.eligibility.blockers")}</h3>
                      <ul>
                        {blockers.map((b) => (
                          <li key={`${b.code}-${b.message}`}>{localizeBlocker(t, b, orderReadiness.gates)}</li>
                        ))}
                      </ul>
                    </div>
                  ) : null}

                  <section className="oh-sa-users-gates" aria-label={t("accountRestrictions.drawerTitle")}>
                    <div className="oh-sa-users-gates__head">
                      <h3>{t("accountRestrictions.drawerTitle")}</h3>
                      <StatusBadge tone={restrictionSummary?.hasActiveRestriction ? "warning" : "success"}>
                        {restrictionSummary?.hasActiveRestriction
                          ? t("accountRestrictions.activeHoldBadge")
                          : t("accountRestrictions.noActive")}
                      </StatusBadge>
                    </div>
                    {restrictionSummary?.hasActiveRestriction ? (
                      <ul>
                        {(restrictionSummary.activeRestrictions || []).map((r) => (
                          <li key={r.id}>
                            {t(`accountRestrictions.types.${r.restrictionType}`, r.restrictionType)} —{" "}
                            {(r.scopes || []).join(", ")}
                            {r.internalReason ? ` — ${r.internalReason}` : ""}
                          </li>
                        ))}
                      </ul>
                    ) : null}
                    <Link className="oh-account-btn-ghost" to="/dashboard/super-admin/account-restrictions">
                      {t("accountRestrictions.manage")}
                    </Link>
                  </section>

                  <div className="oh-sa-users-form-grid">
                    <label className="oh-sa-users-field">
                      <span>{t("users.fields.firstName")}</span>
                      <input
                        value={accountDraft.firstName}
                        onChange={(e) => setAccountDraft((s) => ({ ...s, firstName: e.target.value }))}
                      />
                    </label>
                    <label className="oh-sa-users-field">
                      <span>{t("users.fields.fatherName")}</span>
                      <input
                        value={accountDraft.fatherName}
                        onChange={(e) => setAccountDraft((s) => ({ ...s, fatherName: e.target.value }))}
                      />
                    </label>
                    <label className="oh-sa-users-field">
                      <span>{t("users.fields.familyName")}</span>
                      <input
                        value={accountDraft.familyName}
                        onChange={(e) => setAccountDraft((s) => ({ ...s, familyName: e.target.value }))}
                      />
                    </label>
                    <label className="oh-sa-users-field">
                      <span>{t("users.fields.phone")}</span>
                      <input
                        value={accountDraft.phone}
                        onChange={(e) => setAccountDraft((s) => ({ ...s, phone: e.target.value }))}
                        dir="ltr"
                      />
                    </label>
                    <label className="oh-sa-users-field">
                      <span>{t("users.fields.whatsapp")}</span>
                      <input
                        value={accountDraft.whatsapp}
                        onChange={(e) => setAccountDraft((s) => ({ ...s, whatsapp: e.target.value }))}
                        dir="ltr"
                      />
                    </label>
                  </div>

                  <div className="oh-sa-users-actions-row">
                    <Button
                      type="button"
                      variant="secondary"
                      onClick={() =>
                        onAction({
                          kind: "account",
                          title: t("users.actions.saveTitle"),
                          payload: { ...accountDraft },
                        })
                      }
                    >
                      {t("users.actions.save")}
                    </Button>
                    <Button
                      type="button"
                      variant={profile.accountStatus === "active" ? "danger" : "primary"}
                      onClick={() =>
                        onAction({
                          kind: "account",
                          title:
                            profile.accountStatus === "active" ? t("users.actions.disableAccount") : t("users.actions.enableAccount"),
                          danger: profile.accountStatus === "active",
                          payload: {
                            accountStatus: profile.accountStatus === "active" ? "inactive" : "active",
                          },
                        })
                      }
                    >
                      {profile.accountStatus === "active" ? t("users.actions.disableAccount") : t("users.actions.enableAccount")}
                    </Button>
                  </div>
                </div>
              ) : null}

              {tab === "identity" ? (
                <div className="oh-sa-users-stack">
                  <div className="oh-sa-users-kv">
                    <div>
                      <span>{t("users.fields.status")}</span>
                      <StatusBadge tone={toneForIdentity(identity?.status)}>
                        {identityLabel(t, identity?.status)}
                      </StatusBadge>
                      {identity?.verificationSource === "manual_admin" ? (
                        <StatusBadge tone="admin_assigned">{t("users.identity.adminBadge")}</StatusBadge>
                      ) : null}
                    </div>
                    {identity?.verificationSource === "manual_admin" ? (
                      <>
                        <div>
                          <span>{t("users.fields.method")}</span>
                          <strong>{dictLabel(t, "methods", identity?.verificationMethod)}</strong>
                        </div>
                        <div>
                          <span>{t("users.fields.verifiedBy")}</span>
                          <strong>{identity?.verifiedByName || "—"}</strong>
                        </div>
                        <div>
                          <span>{t("users.fields.verifiedAt")}</span>
                          <strong>{formatLocaleDateTime(identity?.verifiedAt, locale)}</strong>
                        </div>
                      </>
                    ) : (
                      <>
                        <div>
                          <span>{t("users.fields.submittedAt")}</span>
                          <strong>{formatLocaleDateTime(identity?.submittedAt, locale)}</strong>
                        </div>
                        <div>
                          <span>{t("users.fields.reviewedAt")}</span>
                          <strong>{formatLocaleDateTime(identity?.reviewedAt, locale)}</strong>
                        </div>
                      </>
                    )}
                    <div>
                      <span>{t("users.fields.resubmissions")}</span>
                      <strong>{identity?.resubmissionCount ?? 0}</strong>
                    </div>
                  </div>
                  {identity?.adminNote && identity?.verificationSource === "manual_admin" ? (
                    <p className="oh-sa-users-note">{identity.adminNote}</p>
                  ) : null}
                  {identity?.rejectionReason ? (
                    <p className="oh-sa-users-note">{t("users.rejectionReason", { reason: identity.rejectionReason })}</p>
                  ) : null}
                  {identity?.externallyVerified ? (
                    <p className="oh-sa-users-note">{t("users.identity.external")}</p>
                  ) : (
                    <div className="oh-sa-users-docs">
                      {["front", "back"].map((side) => {
                        const doc = identity?.documents?.[side];
                        return (
                          <div key={side} className="oh-sa-users-doc">
                            <strong>{side === "front" ? t("users.identity.front") : t("users.identity.back")}</strong>
                            {doc?.protectedPath ? (
                              <Button type="button" variant="secondary" onClick={() => openProtectedPath(doc.protectedPath)}>
                                {t("users.identity.openFile")}
                              </Button>
                            ) : (
                              <span className="oh-sa-users-muted">{t("users.identity.noFile")}</span>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}
                  <div className="oh-sa-users-actions-row oh-sa-users-actions-row--primary">
                    {identity?.manualStatus === "approved" ? (
                      <Button
                        type="button"
                        variant="danger"
                        onClick={() =>
                          onAction({
                            kind: "identity",
                            title: t("users.identity.revokeTitle"),
                            danger: true,
                            description: t("users.identity.revokeDescription"),
                            confirmLabel: t("users.identity.revokeConfirm"),
                            checkboxLabel: t("users.identity.revokeCheck"),
                            payload: { action: "manual_identity_revoked" },
                          })
                        }
                      >
                        {t("users.identity.revoke")}
                      </Button>
                    ) : (
                      <Button
                        type="button"
                        onClick={() =>
                          onAction({
                            kind: "identity",
                            title: t("users.identity.approveManualTitle"),
                            description: t("users.identity.approveManualDescription"),
                            confirmLabel: t("users.identity.approveManualConfirm"),
                            selectLabel: t("users.identity.methodLabel"),
                            selectOptions: IDENTITY_METHOD_OPTIONS.map((value) => ({
                              value,
                              label: t(`users.methods.${value}`),
                            })),
                            checkboxLabel: t("users.identity.approveManualCheck"),
                            noteLabel: t("users.identity.adminNote"),
                            payload: { action: "manual_identity_approved" },
                          })
                        }
                      >
                        {t("users.identity.approveManual")}
                      </Button>
                    )}
                  </div>
                  <div className="oh-sa-users-actions-row oh-sa-users-actions-row--secondary">
                    <Button
                      type="button"
                      variant="secondary"
                      onClick={() =>
                        onAction({
                          kind: "identity",
                          title: t("users.identity.approveUploadedTitle"),
                          payload: { action: "approve_identity" },
                        })
                      }
                    >
                      {t("users.identity.approveUploaded")}
                    </Button>
                    <Button
                      type="button"
                      variant="secondary"
                      onClick={() =>
                        onAction({
                          kind: "identity",
                          title: t("users.identity.pendingTitle"),
                          payload: { action: "mark_pending_review" },
                        })
                      }
                    >
                      {t("users.identity.pending")}
                    </Button>
                    <Button
                      type="button"
                      variant="danger"
                      onClick={() =>
                        onAction({
                          kind: "identity",
                          title: t("users.identity.rejectTitle"),
                          danger: true,
                          payload: { action: "reject_identity" },
                        })
                      }
                    >
                      {t("users.identity.reject")}
                    </Button>
                    <Button
                      type="button"
                      variant="danger"
                      onClick={() =>
                        onAction({
                          kind: "identity",
                          title: t("users.identity.resubmitTitle"),
                          danger: true,
                          payload: { action: "request_resubmission" },
                        })
                      }
                    >
                      {t("users.identity.resubmit")}
                    </Button>
                  </div>
                </div>
              ) : null}

              {tab === "plan" ? (
                <div className="oh-sa-users-stack">
                  <div className="oh-sa-users-kv">
                    <div>
                      <span>{t("users.fields.currentPlan")}</span>
                      <strong>
                        {subscription?.plan?.title ||
                          subscription?.plan?.name ||
                          (subscription ? t("users.assignedPlan") : t("users.noPlan"))}
                      </strong>
                    </div>
                    <div>
                      <span>{t("users.fields.subscriptionStatus")}</span>
                      <strong>
                        {schedule.statusLabel ||
                          subscriptionStatusLabel(t, subscription?.status)}
                      </strong>
                    </div>
                    <div>
                      <span>{t("users.fields.activation")}</span>
                      <strong>{activationStatusLabel(t, subscription?.activationStatus)}</strong>
                    </div>
                    {schedule.durationLabel ? (
                      <div>
                        <span>{t("users.fields.duration")}</span>
                        <strong>{schedule.durationLabel}</strong>
                      </div>
                    ) : null}
                    <div>
                      <span>{t("users.fields.start")}</span>
                      <strong>
                        {schedule.startLabel ||
                          formatLocaleDate(subscription?.actualStartDate, locale)}
                      </strong>
                    </div>
                    <div>
                      <span>{t("users.fields.expiry")}</span>
                      <strong>
                        {schedule.expiryLabel ||
                          formatLocaleDate(subscription?.expiryDate, locale)}
                      </strong>
                    </div>
                    {subscriptionSourceLabel(t, subscription?.source) ? (
                      <div>
                        <span>{t("users.fields.source")}</span>
                        <strong>{subscriptionSourceLabel(t, subscription?.source)}</strong>
                      </div>
                    ) : null}
                  </div>
                  <label className="oh-sa-users-field">
                    <span>{t("users.fields.choosePlan")}</span>
                    <select value={planId} onChange={(e) => setPlanId(e.target.value)}>
                      <option value="">{t("users.actions.choosePlan")}</option>
                      {(plans || []).map((p) => (
                        <option key={p.id} value={String(p.id)}>
                          {p.title || p.name || t("users.planOption", { id: p.id })}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="oh-sa-users-field">
                    <span>{t("users.fields.duration")}</span>
                    <select value={durationChoice} onChange={(e) => setDurationChoice(e.target.value)}>
                      {PACKAGE_DURATION_OPTIONS.map((value) => (
                        <option key={value} value={value}>
                          {value === "custom" ? t("users.duration.custom") : durationMonthsText(t, Number(value))}
                        </option>
                      ))}
                    </select>
                  </label>
                  {durationChoice === "custom" ? (
                    <label className="oh-sa-users-field">
                      <span>{t("users.fields.months")}</span>
                      <input
                        type="number"
                        min={1}
                        max={120}
                        value={customMonths}
                        onChange={(e) => setCustomMonths(e.target.value)}
                      />
                    </label>
                  ) : null}
                  <div className="oh-sa-users-actions-row oh-sa-users-actions-row--primary">
                    <Button
                      type="button"
                      disabled={!planId || !selectedDurationMonths}
                      onClick={() =>
                        onAction({
                          kind: "membership",
                          title: t("users.plan.activateTitle"),
                          description: t("users.plan.activateDescription"),
                          confirmLabel: t("users.plan.activate"),
                          payload: {
                            action: "activate_plan",
                            planId: Number(planId),
                            durationMonths: selectedDurationMonths,
                          },
                        })
                      }
                    >
                      {t("users.plan.activate")}
                    </Button>
                  </div>
                  <div className="oh-sa-users-actions-row oh-sa-users-actions-row--secondary">
                    <Button
                      type="button"
                      variant="secondary"
                      disabled={!planId}
                      onClick={() =>
                        onAction({
                          kind: "membership",
                          title: t("users.plan.assignWithoutStartTitle"),
                          description: t("users.plan.assignWithoutStartDescription"),
                          confirmLabel: t("users.plan.assignWithoutActivation"),
                          payload: {
                            action: subscription ? "change_plan" : "assign_plan",
                            planId: Number(planId),
                          },
                        })
                      }
                    >
                      {t("users.plan.assignWithoutStart")}
                    </Button>
                    <Button
                      type="button"
                      variant="danger"
                      disabled={!subscription}
                      onClick={() =>
                        onAction({
                          kind: "membership",
                          title: t("users.plan.cancelTitle"),
                          danger: true,
                          description: t("users.plan.cancelDescription"),
                          confirmLabel: t("users.plan.cancel"),
                          payload: { action: "cancel_plan" },
                        })
                      }
                    >
                      {t("users.plan.cancel")}
                    </Button>
                  </div>
                </div>
              ) : null}

              {tab === "courses" ? (
                <div className="oh-sa-users-stack">
                  <p className="oh-sa-users-muted">
                    {t("users.courseSummary", {
                      status: courseLabel(t, training?.status),
                      completed: training?.completed ?? 0,
                      total: training?.total ?? 0,
                    })}
                    {(training?.pendingFinalTest || 0) > 0
                      ? ` · ${t("users.pendingExams", { count: training.pendingFinalTest })}`
                      : ""}
                  </p>
                  {(training?.courses || []).length === 0 ? (
                    <DashboardEmptyState title={t("users.courses.emptyTitle")} description={t("users.courses.emptyDescription")} />
                  ) : (
                    <div className="oh-sa-users-table-wrap">
                      <table className="oh-sa-users-table oh-sa-users-table--compact">
                        <thead>
                          <tr>
                            <th>{t("users.columns.course")}</th>
                            <th>{t("users.columns.progress")}</th>
                            <th>{t("users.columns.actions")}</th>
                          </tr>
                        </thead>
                        <tbody>
                          {(training.courses || []).map((c) => (
                            <tr key={c.id}>
                              <td>
                                {c.title || t("users.courseOption", { id: c.id })}
                                {c.required ? <span className="oh-sa-users-muted"> · {t("users.requiredMark")}</span> : null}
                              </td>
                              <td>
                                <div>{t("users.progressLine", { percent: c.progress?.percentage ?? 0 })}</div>
                                {c.completionSource === "admin_override" ? (
                                  <div className="oh-sa-users-course-admin">
                                    <StatusBadge tone="success">{t("users.courses.completed")}</StatusBadge>
                                    <StatusBadge tone="admin_assigned">{t("users.courses.adminAssigned")}</StatusBadge>
                                    <div className="oh-sa-users-muted">
                                      {t("users.byActor", { name: c.completedByAdminName || "—" })}
                                    </div>
                                    <div className="oh-sa-users-muted">{t("users.onDate", { date: formatLocaleDateTime(c.courseCompletedAt, locale) })}</div>
                                  </div>
                                ) : c.courseCompletedAt ? (
                                  <StatusBadge tone="success">{t("users.courses.completed")}</StatusBadge>
                                ) : (
                                  <span className="oh-sa-users-muted">{t("users.courses.incomplete")}</span>
                                )}
                                {c.isTestingEnabled && c.examFinalGrade == null && c.completionSource === "admin_override" ? (
                                  <div className="oh-sa-users-muted">{t("users.courses.examNotApproved")}</div>
                                ) : null}
                              </td>
                              <td>
                                <div className="oh-sa-users-table__actions">
                                  {c.completionSource === "admin_override" ? (
                                    <Button
                                      type="button"
                                      variant="danger"
                                      onClick={() =>
                                        onAction({
                                          kind: "training",
                                          title: t("users.courses.revokeTitle"),
                                          danger: true,
                                          description: t("users.courses.revokeDescription"),
                                          confirmLabel: t("users.courses.revokeConfirm"),
                                          checkboxLabel: t("users.courses.revokeCheck"),
                                          payload: { action: "admin_course_completion_revoked", courseId: Number(c.id) },
                                        })
                                      }
                                    >
                                      {t("users.courses.revoke")}
                                    </Button>
                                  ) : c.courseCompletedAt ? null : (
                                    <Button
                                      type="button"
                                      onClick={() =>
                                        onAction({
                                          kind: "training",
                                          title: t("users.courses.completeTitle"),
                                          description: t("users.courses.completeDescription"),
                                          confirmLabel: t("users.courses.completeConfirm"),
                                          selectLabel: t("users.courses.reasonLabel"),
                                          selectOptions: COURSE_REASON_OPTIONS.map((value) => ({
                                            value,
                                            label: t(`users.courseReasons.${value}`),
                                          })),
                                          checkboxLabel: t("users.courses.completeCheck"),
                                          noteLabel: t("users.note"),
                                          payload: { action: "admin_course_completed", courseId: Number(c.id) },
                                        })
                                      }
                                    >
                                      {t("users.courses.complete")}
                                    </Button>
                                  )}
                                  <Button
                                    type="button"
                                    variant="secondary"
                                    onClick={() =>
                                      onAction({
                                        kind: "training",
                                        title: t("users.courses.resetProgressTitle"),
                                        danger: true,
                                        description: t("users.courses.resetProgressDescription"),
                                        payload: { action: "reset_course_progress", courseId: Number(c.id) },
                                      })
                                    }
                                  >
                                    {t("users.courses.resetProgress")}
                                  </Button>
                                  <Button
                                    type="button"
                                    variant="secondary"
                                    onClick={() =>
                                      onAction({
                                        kind: "training",
                                        title: t("users.courses.resetExamTitle"),
                                        description: t("users.courses.resetExamDescription"),
                                        payload: { action: "reset_final_test", courseId: Number(c.id) },
                                      })
                                    }
                                  >
                                    {t("users.courses.resetExam")}
                                  </Button>
                                </div>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              ) : null}

              {tab === "activity" ? (
                <div className="oh-sa-users-kv">
                  <div>
                    <span>{t("users.activity.asClient")}</span>
                    <strong>{activity?.ordersAsClient ?? 0}</strong>
                  </div>
                  <div>
                    <span>{t("users.activity.asFreelancer")}</span>
                    <strong>{activity?.ordersAsFreelancer ?? 0}</strong>
                  </div>
                  <div>
                    <span>{t("users.activity.bids")}</span>
                    <strong>{activity?.bids ?? 0}</strong>
                  </div>
                  <div>
                    <span>{t("users.activity.lastSeen")}</span>
                    <strong>{formatLocaleDateTime(activity?.lastSeenAt || profile.lastSeenAt, locale)}</strong>
                  </div>
                </div>
              ) : null}

              {tab === "audit" ? (
                auditEvents.length === 0 ? (
                  <DashboardEmptyState title={t("users.audit.emptyTitle")} description={t("users.audit.emptyDescription")} />
                ) : (
                  <ul className="oh-sa-users-audit">
                    {auditEvents.map((ev) => (
                      <li key={ev.id}>
                        <div className="oh-sa-users-audit__top">
                          <strong>{ev.action}</strong>
                          <span>{formatLocaleDateTime(ev.createdAt, locale)}</span>
                        </div>
                        <p>{ev.reason || "—"}</p>
                        <span className="oh-sa-users-muted">{t("users.byActor", { name: ev.actorName || ev.actorAdminId || "—" })}</span>
                      </li>
                    ))}
                  </ul>
                )
              ) : null}
            </>
          ) : null}
        </div>
      </aside>
    </div>
  );
}

export default function SuperAdminUsersPage() {
  const { push } = useToast();
  const { t, locale } = useTranslation();
  const [stats, setStats] = useState(null);
  const [statsError, setStatsError] = useState("");
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [total, setTotal] = useState(0);
  const [activeTab, setActiveTab] = useState("all");
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchInput, setSearchInput] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const searchInputRef = useRef(null);
  const [selected, setSelected] = useState(() => new Set());
  const [plans, setPlans] = useState([]);
  const [detailUserId, setDetailUserId] = useState(null);
  const [detail, setDetail] = useState(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState("");
  const [reasonModal, setReasonModal] = useState(null);
  const [busy, setBusy] = useState(false);
  const [bulkPlanId, setBulkPlanId] = useState("");
  const [bulkStatus, setBulkStatus] = useState("inactive");
  const [rowMenuUserId, setRowMenuUserId] = useState(null);

  const tabParams = useMemo(() => {
    const tab = FILTER_TABS.find((t) => t.id === activeTab) || FILTER_TABS[0];
    return tab.params || {};
  }, [activeTab]);

  const loadStats = useCallback(async () => {
    try {
      setStatsError("");
      const res = await getSuperAdminUsersStatsRequest();
      setStats(res?.data?.stats || null);
    } catch (err) {
      setStatsError(errorMessage(err, t, locale));
      setStats(null);
    }
  }, [t, locale]);

  const loadUsers = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const params = {
        page,
        limit: PAGE_SIZE,
        ...tabParams,
      };
      if (searchQuery) params.q = searchQuery;
      const res = await listSuperAdminUsersRequest(params);
      setItems(res?.data?.items || []);
      setTotal(Number(res?.data?.total || 0));
      setTotalPages(Number(res?.data?.totalPages || 1));
      setSelected(new Set());
      setRowMenuUserId(null);
    } catch (err) {
      setError(errorMessage(err, t, locale));
      setItems([]);
    } finally {
      setLoading(false);
    }
  }, [page, tabParams, searchQuery, t, locale]);

  const loadPlans = useCallback(async () => {
    try {
      const res = await listAdminPlansRequest(false);
      setPlans(res?.data?.plans || []);
    } catch {
      setPlans([]);
    }
  }, []);

  const loadDetail = useCallback(async (userId) => {
    if (!userId) return;
    setDetailLoading(true);
    setDetailError("");
    try {
      const res = await getSuperAdminUserDetailRequest(userId);
      setDetail(res?.data || null);
    } catch (err) {
      setDetail(null);
      setDetailError(errorMessage(err, t, locale));
    } finally {
      setDetailLoading(false);
    }
  }, [t, locale]);

  useEffect(() => {
    loadStats();
    loadPlans();
  }, [loadStats, loadPlans]);

  useEffect(() => {
    loadUsers();
  }, [loadUsers]);

  useEffect(() => {
    if (detailUserId) loadDetail(detailUserId);
  }, [detailUserId, loadDetail]);

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

  const selectTab = (tabId) => {
    if (tabId === activeTab) return;
    setActiveTab(tabId);
    setPage(1);
  };

  const openSearch = () => setSearchOpen(true);

  const closeSearch = () => {
    setSearchOpen(false);
    if (searchInput.trim()) {
      setSearchInput("");
      setSearchQuery("");
      setPage(1);
    }
  };

  const allSelected = items.length > 0 && items.every((u) => selected.has(String(u.id)));
  const selectedIds = useMemo(() => [...selected].map((id) => Number(id)), [selected]);

  const toggleAll = () => {
    if (allSelected) setSelected(new Set());
    else setSelected(new Set(items.map((u) => String(u.id))));
  };

  const toggleOne = (id) => {
    const key = String(id);
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const closeDetail = () => {
    setDetailUserId(null);
    setDetail(null);
    setDetailError("");
  };

  const runReasonedAction = async (input) => {
    if (!reasonModal) return;
    const reason = typeof input === "string" ? input : String(input?.reason || "");
    const method = typeof input === "object" && input ? input.method : null;
    const note = typeof input === "object" && input ? input.note : null;
    setBusy(true);
    try {
      const { type } = reasonModal;
      if (type === "bulk") {
        const action = reasonModal.action;
        const payload = { ...(reasonModal.payload || {}) };
        const res = await postSuperAdminUsersBulkActionsRequest({
          userIds: selectedIds,
          action,
          payload,
          reason,
        });
        if (action === "export_selected_users_csv" && res?.data?.csv) {
          downloadCsv(res.data.csv, `users-export-${Date.now()}.csv`);
        }
        const ok = res?.data?.succeeded ?? selectedIds.length;
        const fail = res?.data?.failed ?? 0;
        push({
          type: fail ? "warning" : "success",
          message: fail
            ? t("users.partialBulk", { ok, fail })
            : t("users.bulkSuccess", { ok }),
        });
        await Promise.all([loadUsers(), loadStats()]);
        if (detailUserId) await loadDetail(detailUserId);
      } else if (type === "detail") {
        const userId = reasonModal.userId;
        const kind = reasonModal.kind;
        const payload = { ...(reasonModal.payload || {}), reason };
        if (method && reasonModal.kind === "identity") payload.verificationMethod = method;
        if (method && reasonModal.kind === "training") payload.completionReasonCode = method;
        if (note) payload.adminNote = note;
        if (kind === "account") {
          await patchSuperAdminUserAccountRequest(userId, payload);
        } else if (kind === "identity") {
          await patchSuperAdminUserIdentityRequest(userId, payload);
        } else if (kind === "membership") {
          await patchSuperAdminUserMembershipRequest(userId, payload);
        } else if (kind === "training") {
          await patchSuperAdminUserTrainingRequest(userId, payload);
        }
        push({ type: "success", message: t("users.saved") });
        await Promise.all([loadUsers(), loadStats(), loadDetail(userId)]);
      }
      setReasonModal(null);
    } catch (err) {
      push({ type: "error", message: errorMessage(err, t, locale) });
    } finally {
      setBusy(false);
    }
  };

  const openBulkModal = (action, title, opts = {}) => {
    if (!selectedIds.length) {
      push({ type: "warning", message: t("users.chooseUsersFirst") });
      return;
    }
    setReasonModal({
      type: "bulk",
      action,
      title,
      description: opts.description || t("users.bulkApply", { count: selectedIds.length }),
      danger: Boolean(opts.danger),
      payload: opts.payload || {},
      confirmLabel: opts.confirmLabel || t("users.confirm"),
      extra: opts.extra || null,
    });
  };

  const openRowAccountModal = (user, { title, accountStatus, danger = false, description }) => {
    setRowMenuUserId(null);
    setReasonModal({
      type: "detail",
      userId: user.id,
      kind: "account",
      title,
      danger: Boolean(danger),
      payload: { accountStatus },
      description: description || t("users.sensitiveReason"),
      confirmLabel: t("users.execute"),
    });
  };

  return (
    <DashboardShell>
      {statsError ? <p className="oh-sa-users-inline-error">{statsError}</p> : null}

      {selected.size > 0 ? (
        <div className="oh-sa-users-bulk" role="region" aria-label={t("users.bulkAria")}>
          <span className="oh-sa-users-bulk__count">{t("users.selectedCount", { count: selected.size })}</span>
          <label className="oh-sa-users-field oh-sa-users-field--inline">
            <span>{t("users.fields.statusLabel")}</span>
            <select value={bulkStatus} onChange={(e) => setBulkStatus(e.target.value)}>
              <option value="active">{t("users.accountStatus.active")}</option>
              <option value="inactive">{t("users.accountStatus.inactive")}</option>
            </select>
          </label>
          <Button
            type="button"
            variant={bulkStatus === "inactive" ? "danger" : "secondary"}
            onClick={() =>
              openBulkModal("set_account_status", t("users.actions.changeAccounts"), {
                danger: bulkStatus === "inactive",
                payload: { accountStatus: bulkStatus },
              })
            }
          >
            {t("users.actions.changeStatus")}
          </Button>
          <label className="oh-sa-users-field oh-sa-users-field--inline">
            <span>{t("users.fields.plan")}</span>
            <select value={bulkPlanId} onChange={(e) => setBulkPlanId(e.target.value)}>
              <option value="">{t("users.actions.choose")}</option>
              {plans.map((p) => (
                <option key={p.id} value={String(p.id)}>
                  {p.title || p.name || `#${p.id}`}
                </option>
              ))}
            </select>
          </label>
          <Button
            type="button"
            disabled={!bulkPlanId}
            onClick={() =>
              openBulkModal("assign_plan", t("users.actions.assignPlanTitle"), {
                payload: { planId: Number(bulkPlanId) },
              })
            }
          >
            {t("users.actions.assignPlan")}
          </Button>
          <Button
            type="button"
            variant="danger"
            onClick={() =>
              openBulkModal("request_kyc_resubmission", t("users.actions.requestKycTitle"), {
                danger: true,
                description: t("users.actions.requestKycDescription"),
              })
            }
          >
            {t("users.actions.requestKyc")}
          </Button>
          <Button
            type="button"
            variant="secondary"
            onClick={() =>
              openBulkModal("export_selected_users_csv", t("users.actions.exportTitle"), {
                confirmLabel: t("users.actions.export"),
              })
            }
          >
            {t("users.actions.export")}
          </Button>
          <Button type="button" variant="secondary" onClick={() => setSelected(new Set())}>
            {t("users.actions.clearSelection")}
          </Button>
        </div>
      ) : null}

      <DashboardSection className="oh-sa-users-list-section">
        <header className="oh-sa-users-list-head">
          <div className="oh-sa-users-list-head__top">
            <div className="oh-sa-users-list-head__titles">
              <h2 className="oh-sa-users-list-head__title">{t("users.listTitle")}</h2>
              {total ? (
                <p className="oh-sa-users-list-head__desc">{t("users.userCount", { count: total.toLocaleString("en-US") })}</p>
              ) : null}
            </div>
            <div className={`oh-sa-users-toolbar__search${searchOpen ? " is-open" : ""}`}>
              {searchOpen ? (
                <>
                  <Search size={16} strokeWidth={2} className="oh-sa-users-toolbar__search-glyph" aria-hidden />
                  <input
                    ref={searchInputRef}
                    type="search"
                    value={searchInput}
                    onChange={(e) => setSearchInput(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Escape") closeSearch();
                    }}
                    placeholder={t("users.searchPlaceholder")}
                    aria-label={t("users.searchAria")}
                  />
                  <button
                    type="button"
                    className="oh-sa-users-toolbar__search-clear"
                    onClick={closeSearch}
                    aria-label={t("users.closeSearch")}
                  >
                    <X size={14} strokeWidth={2.25} aria-hidden />
                  </button>
                </>
              ) : (
                <button
                  type="button"
                  className="oh-sa-users-toolbar__search-btn"
                  onClick={openSearch}
                  aria-label={t("users.search")}
                >
                  <Search size={18} strokeWidth={2} aria-hidden />
                </button>
              )}
            </div>
          </div>

          <div className="oh-sa-users-toolbar__tabs" role="tablist" aria-label={t("users.filterAria")}>
            {FILTER_TABS.map((tab) => {
              const count = stats?.[tab.countKey];
              const showBadge = Number(count || 0) > 0;
              const isActive = activeTab === tab.id;
              return (
                <button
                  key={tab.id}
                  type="button"
                  role="tab"
                  aria-selected={isActive}
                  className={`oh-sa-users-tab${isActive ? " is-active" : ""}`}
                  onClick={() => selectTab(tab.id)}
                >
                  <span className="oh-sa-users-tab__label">{t(tab.labelKey)}</span>
                  {showBadge ? (
                    <span className="oh-sa-users-tab__badge">{formatCount(count)}</span>
                  ) : null}
                </button>
              );
            })}
          </div>
        </header>

        {error && !loading ? <DashboardErrorState message={error} onRetry={loadUsers} /> : null}
        {loading ? (
          <DashboardLoadingState label={t("users.loadingUsers")} />
        ) : items.length === 0 ? (
          <DashboardEmptyState title={t("users.emptyTitle")} description={t("users.emptyDescription")} />
        ) : (
          <>
            <div className="oh-sa-users-table-wrap oh-sa-users-table-wrap--airy">
              <table className="oh-sa-users-table oh-sa-users-table--airy">
                <thead>
                  <tr>
                    <th className="oh-sa-users-table__check">
                      <input type="checkbox" checked={allSelected} onChange={toggleAll} aria-label={t("users.selectAll")} />
                    </th>
                    <th className="oh-sa-users-col oh-sa-users-col--user">{t("users.columns.user")}</th>
                    <th className="oh-sa-users-col oh-sa-users-col--role">{t("users.columns.role")}</th>
                    <th className="oh-sa-users-col oh-sa-users-col--account">{t("users.columns.account")}</th>
                    <th className="oh-sa-users-col oh-sa-users-col--identity">{t("users.columns.identity")}</th>
                    <th className="oh-sa-users-col oh-sa-users-col--plan">{t("users.columns.plan")}</th>
                    <th className="oh-sa-users-col oh-sa-users-col--courses">{t("users.columns.courses")}</th>
                    <th className="oh-sa-users-col oh-sa-users-col--seen">{t("users.columns.lastSeen")}</th>
                    <th className="oh-sa-users-col oh-sa-users-col--created">{t("users.columns.created")}</th>
                    <th className="oh-sa-users-col oh-sa-users-col--actions">{t("users.columns.actions")}</th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((user) => {
                    const id = String(user.id);
                    const initial = String(user.fullName || user.email || "?")
                      .trim()
                      .slice(0, 1)
                      .toUpperCase();
                    return (
                      <tr key={id}>
                        <td className="oh-sa-users-table__check">
                          <input
                            type="checkbox"
                            checked={selected.has(id)}
                            onChange={() => toggleOne(id)}
                            aria-label={t("users.selectUser", { name: user.fullName || user.email || id })}
                          />
                        </td>
                        <td className="oh-sa-users-col oh-sa-users-col--user">
                          <div className="oh-sa-users-person">
                            <span
                              className="oh-sa-users-person__avatar-wrap"
                              title={user.isOnline ? t("users.online") : t("users.offline")}
                            >
                              <span className="oh-sa-users-person__avatar" aria-hidden>
                                {user.avatarUrl ? (
                                  <img src={user.avatarUrl} alt="" />
                                ) : (
                                  initial
                                )}
                              </span>
                              <span
                                className={
                                  user.isOnline
                                    ? "oh-sa-users-person__presence oh-sa-users-person__presence--online"
                                    : "oh-sa-users-person__presence oh-sa-users-person__presence--offline"
                                }
                                aria-label={user.isOnline ? t("users.online") : t("users.offline")}
                              />
                            </span>
                            <span className="oh-sa-users-person__text">
                              <strong className="oh-sa-users-person__name">{user.fullName || t("users.unnamed")}</strong>
                              <span className="oh-sa-users-person__sub" dir="ltr">
                                {user.email || "—"}
                              </span>
                            </span>
                          </div>
                        </td>
                        <td className="oh-sa-users-col oh-sa-users-col--role">
                          <span className="oh-sa-users-cell-primary">{roleLabel(t, user.role)}</span>
                        </td>
                        <td className="oh-sa-users-col oh-sa-users-col--account">
                          <StatusBadge tone={toneForAccount(user.accountStatus)} className="oh-sa-users-pill">
                            {accountLabel(t, user.accountStatus)}
                          </StatusBadge>
                        </td>
                        <td className="oh-sa-users-col oh-sa-users-col--identity">
                          <StatusBadge tone={toneForIdentity(user.identityStatus)} className="oh-sa-users-pill">
                            {identityLabel(t, user.identityStatus)}
                          </StatusBadge>
                        </td>
                        <td className="oh-sa-users-col oh-sa-users-col--plan">
                          <div className="oh-sa-users-stack-cell">
                            <span className="oh-sa-users-cell-primary">{user.membershipTier || "—"}</span>
                            <span className="oh-sa-users-cell-sub">{membershipLabel(t, user.membershipStatus)}</span>
                          </div>
                        </td>
                        <td className="oh-sa-users-col oh-sa-users-col--courses">
                          <StatusBadge tone={toneForCourse(user.courseStatus)} className="oh-sa-users-pill">
                            {courseLabel(t, user.courseStatus)}
                            {user.coursesTotal
                              ? ` (${user.coursesCompleted || 0}/${user.coursesTotal})`
                              : ""}
                          </StatusBadge>
                        </td>
                        <td className="oh-sa-users-col oh-sa-users-col--seen">
                          <span className="oh-sa-users-cell-sub">{formatLocaleDateTime(user.lastSeenAt, locale)}</span>
                        </td>
                        <td className="oh-sa-users-col oh-sa-users-col--created">
                          <span className="oh-sa-users-cell-sub">{formatLocaleDate(user.createdAt, locale)}</span>
                        </td>
                        <td className="oh-sa-users-col oh-sa-users-col--actions">
                          <UserRowActionsMenu
                            user={user}
                            open={rowMenuUserId === id}
                            onOpenChange={(next) => setRowMenuUserId(next ? id : null)}
                            onEdit={() => setDetailUserId(user.id)}
                            onToggleStatus={() =>
                              openRowAccountModal(user, {
                                title:
                                  user.accountStatus === "active" ? t("users.actions.disableAccount") : t("users.actions.enableAccount"),
                                accountStatus: user.accountStatus === "active" ? "inactive" : "active",
                                danger: user.accountStatus === "active",
                              })
                            }
                            onDelete={() =>
                              openRowAccountModal(user, {
                                title: t("users.actions.deleteAccount"),
                                accountStatus: "inactive",
                                danger: true,
                                description: t("users.actions.deleteDescription"),
                              })
                            }
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
        )}
      </DashboardSection>

      <UserDetailDrawer
        open={Boolean(detailUserId)}
        loading={detailLoading}
        error={detailError}
        detail={detail}
        plans={plans}
        onClose={closeDetail}
        onReload={() => loadDetail(detailUserId)}
        onAction={(spec) =>
          setReasonModal({
            type: "detail",
            userId: detailUserId,
            kind: spec.kind,
            title: spec.title,
            danger: Boolean(spec.danger),
            payload: spec.payload,
            description: spec.description || t("users.sensitiveReason"),
            confirmLabel: spec.confirmLabel || t("users.execute"),
            selectLabel: spec.selectLabel || null,
            selectOptions: spec.selectOptions || null,
            checkboxLabel: spec.checkboxLabel || null,
            noteLabel: spec.noteLabel || null,
          })
        }
      />

      <ReasonModal
        open={Boolean(reasonModal)}
        title={reasonModal?.title || ""}
        description={reasonModal?.description}
        confirmLabel={reasonModal?.confirmLabel}
        danger={reasonModal?.danger}
        busy={busy}
        extra={reasonModal?.extra}
        selectLabel={reasonModal?.selectLabel}
        selectOptions={reasonModal?.selectOptions}
        checkboxLabel={reasonModal?.checkboxLabel}
        noteLabel={reasonModal?.noteLabel}
        onClose={() => (busy ? null : setReasonModal(null))}
        onConfirm={runReasonedAction}
      />
    </DashboardShell>
  );
}
