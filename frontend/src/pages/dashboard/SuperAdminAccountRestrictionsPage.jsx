import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import DashboardPageHeader from "../../components/dashboard/DashboardPageHeader";
import { superAdminBreadcrumbs } from "../../components/dashboard/dashboardBreadcrumbs";
import { useToast } from "../../components/ui/toastContext";
import { useTranslation } from "../../i18n/LanguageProvider";
import "../../i18n/accountRestrictionsResources";
import {
  createSuperAdminAccountRestrictionRequest,
  extendSuperAdminAccountRestrictionRequest,
  listSuperAdminAccountRestrictionsRequest,
  listSuperAdminHeldBidsRequest,
  rejectSuperAdminHeldBidRequest,
  releaseSuperAdminHeldBidRequest,
  revokeSuperAdminAccountRestrictionRequest,
} from "../../services/api";
import { getSafeApiErrorMessage } from "../../utils/apiErrorMessage";
import "./shared/account-pages.css";

const TABS = ["ACTIVE", "EXPIRED", "REVOKED"];
const SCOPE_OPTIONS = [
  "ALL_MARKETPLACE",
  "bids",
  "direct_claims",
  "order_assignments",
  "articles",
  "competitions",
];
const TYPE_OPTIONS = [
  "ACCOUNT_REVIEW_HOLD",
  "MARKETPLACE_RESTRICTED",
  "CONTENT_REVIEW",
  "FULL_SUSPENSION",
];

function formatDate(value, locale) {
  if (!value) return "—";
  try {
    const tag = locale === "en" ? "en-JO-u-nu-latn" : "ar-JO-u-nu-latn";
    return new Date(value).toLocaleString(tag);
  } catch {
    return String(value);
  }
}

export default function SuperAdminAccountRestrictionsPage() {
  const { t, dir, locale } = useTranslation();
  const toast = useToast();
  const [tab, setTab] = useState("ACTIVE");
  const [q, setQ] = useState("");
  const [loading, setLoading] = useState(true);
  const [items, setItems] = useState([]);
  const [error, setError] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [busy, setBusy] = useState(false);
  const [heldBids, setHeldBids] = useState([]);
  const [form, setForm] = useState({
    userId: "",
    restrictionType: "ACCOUNT_REVIEW_HOLD",
    scopes: ["ALL_MARKETPLACE"],
    internalReason: "",
    internalNote: "",
    expiresAt: "",
  });

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const res = await listSuperAdminAccountRestrictionsRequest({
        status: tab,
        q: q.trim() || undefined,
        limit: 50,
      });
      setItems(res?.data?.items || []);
      const held = await listSuperAdminHeldBidsRequest({ limit: 30 });
      setHeldBids(held?.data?.items || []);
    } catch (err) {
      setError(getSafeApiErrorMessage(err) || t("accountRestrictions.loadError"));
      setItems([]);
    } finally {
      setLoading(false);
    }
  }, [tab, q, t]);

  useEffect(() => {
    void load();
  }, [load]);

  const crumbs = useMemo(
    () => superAdminBreadcrumbs(t, [{ label: t("accountRestrictions.title") }]),
    [t],
  );

  const toggleScope = (scope) => {
    setForm((prev) => {
      if (scope === "ALL_MARKETPLACE") {
        return { ...prev, scopes: ["ALL_MARKETPLACE"] };
      }
      const withoutAll = prev.scopes.filter((s) => s !== "ALL_MARKETPLACE");
      const next = withoutAll.includes(scope)
        ? withoutAll.filter((s) => s !== scope)
        : [...withoutAll, scope];
      return { ...prev, scopes: next.length ? next : ["ALL_MARKETPLACE"] };
    });
  };

  const submitCreate = async () => {
    if (!String(form.internalReason || "").trim()) {
      toast.error(t("accountRestrictions.form.reasonRequired"));
      return;
    }
    setBusy(true);
    try {
      await createSuperAdminAccountRestrictionRequest({
        userId: Number(form.userId),
        restrictionType: form.restrictionType,
        scopes: form.scopes,
        internalReason: form.internalReason.trim(),
        internalNote: form.internalNote.trim() || null,
        expiresAt: form.expiresAt ? new Date(form.expiresAt).toISOString() : null,
      });
      toast.success(t("accountRestrictions.saveOk"));
      setShowForm(false);
      setForm({
        userId: "",
        restrictionType: "ACCOUNT_REVIEW_HOLD",
        scopes: ["ALL_MARKETPLACE"],
        internalReason: "",
        internalNote: "",
        expiresAt: "",
      });
      await load();
    } catch (err) {
      toast.error(getSafeApiErrorMessage(err) || t("accountRestrictions.loadError"));
    } finally {
      setBusy(false);
    }
  };

  const onRevoke = async (id) => {
    const reason = window.prompt(t("accountRestrictions.revokeReason")) || "";
    setBusy(true);
    try {
      await revokeSuperAdminAccountRestrictionRequest(id, { revokeReason: reason || null });
      toast.success(t("accountRestrictions.revokeOk"));
      await load();
    } catch (err) {
      toast.error(getSafeApiErrorMessage(err) || t("accountRestrictions.loadError"));
    } finally {
      setBusy(false);
    }
  };

  const onExtend = async (id) => {
    const raw = window.prompt(t("accountRestrictions.expiresAt"), "");
    if (!raw) return;
    setBusy(true);
    try {
      await extendSuperAdminAccountRestrictionRequest(id, {
        expiresAt: new Date(raw).toISOString(),
      });
      toast.success(t("accountRestrictions.saveOk"));
      await load();
    } catch (err) {
      toast.error(getSafeApiErrorMessage(err) || t("accountRestrictions.loadError"));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="oh-account-page" dir={dir}>
      <DashboardPageHeader
        title={t("accountRestrictions.title")}
        subtitle={t("accountRestrictions.subtitle")}
        crumbs={crumbs}
        actions={
          <button type="button" className="oh-account-btn-primary" onClick={() => setShowForm(true)}>
            {t("accountRestrictions.add")}
          </button>
        }
      />

      <p className="oh-account-value" style={{ color: "#64748b", fontSize: 13, marginTop: 8 }}>
        {t("accountRestrictions.privacyNote")}
      </p>

      <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginTop: 16 }}>
        {TABS.map((key) => (
          <button
            key={key}
            type="button"
            className={tab === key ? "oh-account-btn-primary" : "oh-account-btn-ghost"}
            onClick={() => setTab(key)}
          >
            {t(`accountRestrictions.tabs.${key === "ACTIVE" ? "active" : key === "EXPIRED" ? "expired" : "revoked"}`)}
          </button>
        ))}
        <input
          type="search"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder={t("accountRestrictions.searchPlaceholder")}
          style={{
            flex: "1 1 220px",
            minWidth: 200,
            borderRadius: 10,
            border: "1px solid #e2e8f0",
            padding: "8px 12px",
          }}
        />
        <button type="button" className="oh-account-btn-ghost" onClick={() => void load()}>
          {t("accountRestrictions.refresh")}
        </button>
      </div>

      {showForm ? (
        <section className="oh-account-card" style={{ marginTop: 16 }}>
          <h2 className="oh-account-card__title">{t("accountRestrictions.add")}</h2>
          <div style={{ display: "grid", gap: 10, maxWidth: 520 }}>
            <label>
              {t("accountRestrictions.form.userId")}
              <input
                value={form.userId}
                onChange={(e) => setForm((p) => ({ ...p, userId: e.target.value }))}
                style={{ width: "100%", marginTop: 4 }}
              />
            </label>
            <label>
              {t("accountRestrictions.type")}
              <select
                value={form.restrictionType}
                onChange={(e) => setForm((p) => ({ ...p, restrictionType: e.target.value }))}
                style={{ width: "100%", marginTop: 4 }}
              >
                {TYPE_OPTIONS.map((type) => (
                  <option key={type} value={type}>
                    {t(`accountRestrictions.types.${type}`)}
                  </option>
                ))}
              </select>
            </label>
            <fieldset style={{ border: "1px solid #e2e8f0", borderRadius: 10, padding: 10 }}>
              <legend>{t("accountRestrictions.scopes")}</legend>
              {SCOPE_OPTIONS.map((scope) => (
                <label key={scope} style={{ display: "flex", gap: 8, marginBottom: 6 }}>
                  <input
                    type="checkbox"
                    checked={form.scopes.includes(scope)}
                    onChange={() => toggleScope(scope)}
                  />
                  {t(`accountRestrictions.scopesLabels.${scope}`)}
                </label>
              ))}
            </fieldset>
            <label>
              {t("accountRestrictions.internalReason")}
              <textarea
                value={form.internalReason}
                onChange={(e) => setForm((p) => ({ ...p, internalReason: e.target.value }))}
                rows={3}
                style={{ width: "100%", marginTop: 4 }}
              />
            </label>
            <label>
              {t("accountRestrictions.internalNote")}
              <textarea
                value={form.internalNote}
                onChange={(e) => setForm((p) => ({ ...p, internalNote: e.target.value }))}
                rows={2}
                style={{ width: "100%", marginTop: 4 }}
              />
            </label>
            <label>
              {t("accountRestrictions.expiresAt")}
              <input
                type="datetime-local"
                value={form.expiresAt}
                onChange={(e) => setForm((p) => ({ ...p, expiresAt: e.target.value }))}
                style={{ width: "100%", marginTop: 4 }}
              />
            </label>
            <div style={{ display: "flex", gap: 8 }}>
              <button type="button" className="oh-account-btn-primary" disabled={busy} onClick={() => void submitCreate()}>
                {t("accountRestrictions.form.save")}
              </button>
              <button type="button" className="oh-account-btn-ghost" disabled={busy} onClick={() => setShowForm(false)}>
                {t("accountRestrictions.form.cancel")}
              </button>
            </div>
          </div>
        </section>
      ) : null}

      <section className="oh-account-card" style={{ marginTop: 16 }}>
        {loading ? (
          <p>{locale === "en" ? "Loading…" : "جارٍ التحميل…"}</p>
        ) : error ? (
          <p className="oh-account-error">{error}</p>
        ) : !items.length ? (
          <p style={{ color: "#64748b" }}>{t("accountRestrictions.empty")}</p>
        ) : (
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 14 }}>
              <thead>
                <tr style={{ color: "#9ca3af", textAlign: "start" }}>
                  <th style={{ padding: 8 }}>{t("accountRestrictions.user")}</th>
                  <th style={{ padding: 8 }}>{t("accountRestrictions.type")}</th>
                  <th style={{ padding: 8 }}>{t("accountRestrictions.scopes")}</th>
                  <th style={{ padding: 8 }}>{t("accountRestrictions.plan")}</th>
                  <th style={{ padding: 8 }}>{t("accountRestrictions.internalReason")}</th>
                  <th style={{ padding: 8 }}>{t("accountRestrictions.expiresAt")}</th>
                  <th style={{ padding: 8 }}>{t("accountRestrictions.manage")}</th>
                </tr>
              </thead>
              <tbody>
                {items.map((row) => (
                  <tr key={row.id} style={{ borderTop: "1px solid #f1f5f9" }}>
                    <td style={{ padding: 8 }}>
                      <div style={{ fontWeight: 700 }}>{row.userName || "—"}</div>
                      <div dir="ltr" style={{ color: "#64748b", fontSize: 12 }}>
                        #{row.userId} · {row.userEmail || "—"}
                      </div>
                      <Link to={`/dashboard/super-admin/users?userId=${row.userId}`} style={{ fontSize: 12 }}>
                        {t("accountRestrictions.manage")}
                      </Link>
                    </td>
                    <td style={{ padding: 8 }}>{t(`accountRestrictions.types.${row.restrictionType}`)}</td>
                    <td style={{ padding: 8 }}>
                      {(row.scopes || []).map((s) => (
                        <span
                          key={s}
                          style={{
                            display: "inline-block",
                            margin: 2,
                            padding: "2px 8px",
                            borderRadius: 999,
                            background: "#f1f5f9",
                            fontSize: 12,
                          }}
                        >
                          {t(`accountRestrictions.scopesLabels.${s}`, s)}
                        </span>
                      ))}
                    </td>
                    <td style={{ padding: 8 }}>{row.planTitle || "—"}</td>
                    <td style={{ padding: 8, maxWidth: 220 }}>{row.internalReason}</td>
                    <td style={{ padding: 8 }}>
                      {row.expiresAt ? formatDate(row.expiresAt, locale) : t("accountRestrictions.noExpiry")}
                    </td>
                    <td style={{ padding: 8 }}>
                      {row.status === "ACTIVE" ? (
                        <div style={{ display: "grid", gap: 6 }}>
                          <button type="button" className="oh-account-btn-ghost" disabled={busy} onClick={() => void onExtend(row.id)}>
                            {t("accountRestrictions.extend")}
                          </button>
                          <button type="button" className="oh-account-btn-ghost" disabled={busy} onClick={() => void onRevoke(row.id)}>
                            {t("accountRestrictions.revoke")}
                          </button>
                        </div>
                      ) : (
                        t(`accountRestrictions.status.${row.status}`)
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="oh-account-card" style={{ marginTop: 16 }}>
        <h2 className="oh-account-card__title">{t("accountRestrictions.heldBids")}</h2>
        {!heldBids.length ? (
          <p style={{ color: "#64748b" }}>{t("accountRestrictions.empty")}</p>
        ) : (
          <ul style={{ listStyle: "none", padding: 0, margin: 0, display: "grid", gap: 10 }}>
            {heldBids.map((bid) => (
              <li
                key={bid.id}
                style={{
                  border: "1px solid #f1f5f9",
                  borderRadius: 12,
                  padding: 12,
                  display: "flex",
                  flexWrap: "wrap",
                  gap: 10,
                  justifyContent: "space-between",
                }}
              >
                <div>
                  <div style={{ fontWeight: 700 }}>
                    Bid #{bid.id} · Order #{bid.orderId} · User #{bid.freelancerUserId}
                  </div>
                  <div style={{ color: "#64748b", fontSize: 13 }}>
                    {bid.amount} · {bid.orderStillOpen ? "open" : "closed"} · {formatDate(bid.heldAt, locale)}
                  </div>
                </div>
                <div style={{ display: "flex", gap: 8 }}>
                  <button
                    type="button"
                    className="oh-account-btn-primary"
                    disabled={busy}
                    onClick={async () => {
                      setBusy(true);
                      try {
                        await releaseSuperAdminHeldBidRequest(bid.id, {});
                        await load();
                      } catch (err) {
                        toast.error(getSafeApiErrorMessage(err));
                      } finally {
                        setBusy(false);
                      }
                    }}
                  >
                    {t("accountRestrictions.releaseBid")}
                  </button>
                  <button
                    type="button"
                    className="oh-account-btn-ghost"
                    disabled={busy}
                    onClick={async () => {
                      setBusy(true);
                      try {
                        await rejectSuperAdminHeldBidRequest(bid.id, {});
                        await load();
                      } catch (err) {
                        toast.error(getSafeApiErrorMessage(err));
                      } finally {
                        setBusy(false);
                      }
                    }}
                  >
                    {t("accountRestrictions.rejectBid")}
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
