import { useCallback, useEffect, useRef, useState } from "react";
import DashboardPageHeader from "../../components/dashboard/DashboardPageHeader";
import DashboardShell from "../../components/dashboard/DashboardShell";
import DashboardSection from "../../components/dashboard/DashboardSection";
import DashboardLoadingState from "../../components/dashboard/DashboardLoadingState";
import DashboardErrorState from "../../components/dashboard/DashboardErrorState";
import { superAdminBreadcrumbs } from "../../components/dashboard/dashboardBreadcrumbs";
import { useToast } from "../../components/ui/toastContext";
import {
  adminCreateOnboardingItemRequest,
  adminDisableOnboardingItemRequest,
  adminEnableOnboardingItemRequest,
  adminListOnboardingItemsRequest,
  adminUpdateOnboardingItemRequest,
} from "../../services/api";
import { getSafeApiErrorMessage } from "../../utils/apiErrorMessage";
import { resolveSafeInternalNavPath } from "../../utils/safeInternalNavPath";
import { useTranslation } from "../../i18n/LanguageProvider";
import "../../i18n/opsAdminResources";

const CONDITIONS = [
  "freelancer_new",
  "profile_incomplete",
  "verification_incomplete",
  "training_incomplete",
  "activation_not_requested",
  "activation_pending_review",
  "activation_rejected",
  "activated",
  "mini_bid_intro",
  "article_mini_bid_intro",
];

const emptyForm = {
  key: "",
  title: "",
  body: "",
  ctaLabel: "",
  ctaUrl: "",
  conditionKey: "mini_bid_intro",
  itemType: "informational",
  placement: "getting_started",
  sortOrder: 0,
  isDismissible: true,
};

export default function SuperAdminOnboardingPage() {
  const { push } = useToast();
  const { t } = useTranslation();
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [form, setForm] = useState(emptyForm);
  const [editingId, setEditingId] = useState(null);
  const [saving, setSaving] = useState(false);
  const savingRef = useRef(false);
  const togglingIdRef = useRef(null);

  const load = useCallback(async () => {
    setError("");
    setLoading(true);
    try {
      const res = await adminListOnboardingItemsRequest();
      setItems(Array.isArray(res?.data?.items) ? res.data.items : []);
    } catch (err) {
      setError(getSafeApiErrorMessage(err) || t("opsAdmin.onboarding.loadError"));
    } finally {
      setLoading(false);
    }
  }, [t]);

  useEffect(() => {
    void load();
  }, [load]);

  const startEdit = (item) => {
    setEditingId(item.id);
    setForm({
      key: item.key,
      title: item.title,
      body: item.body,
      ctaLabel: item.ctaLabel || "",
      ctaUrl: item.ctaUrl || "",
      conditionKey: item.conditionKey,
      itemType: item.itemType,
      placement: item.placement,
      sortOrder: item.sortOrder,
      isDismissible: item.isDismissible,
    });
  };

  const save = async (e) => {
    e.preventDefault();
    if (saving || savingRef.current) return;
    const ctaRaw = String(form.ctaUrl || "").trim();
    let ctaUrl = null;
    if (ctaRaw) {
      ctaUrl = resolveSafeInternalNavPath(ctaRaw, "");
      if (!ctaUrl) {
        push(t("opsAdmin.onboarding.errCtaPath"), "error");
        return;
      }
    }
    savingRef.current = true;
    setSaving(true);
    try {
      const payload = {
        ...form,
        sortOrder: Number(form.sortOrder) || 0,
        ctaLabel: form.ctaLabel || null,
        ctaUrl,
      };
      if (editingId) {
        await adminUpdateOnboardingItemRequest(editingId, payload);
        push(t("opsAdmin.onboarding.saved"), "success");
      } else {
        await adminCreateOnboardingItemRequest(payload);
        push(t("opsAdmin.onboarding.created"), "success");
      }
      setEditingId(null);
      setForm(emptyForm);
      await load();
    } catch (err) {
      push(getSafeApiErrorMessage(err) || t("opsAdmin.onboarding.saveError"), "error");
    } finally {
      savingRef.current = false;
      setSaving(false);
    }
  };

  const toggleEnabled = async (item) => {
    if (togglingIdRef.current) return;
    togglingIdRef.current = item.id;
    try {
      if (item.isEnabled) await adminDisableOnboardingItemRequest(item.id);
      else await adminEnableOnboardingItemRequest(item.id);
      await load();
    } catch (err) {
      push(getSafeApiErrorMessage(err) || t("opsAdmin.onboarding.toggleError"), "error");
    } finally {
      togglingIdRef.current = null;
    }
  };

  return (
    <DashboardShell>
      <DashboardPageHeader
        title={t("opsAdmin.onboarding.title")}
        description={t("opsAdmin.onboarding.description")}
        breadcrumbs={superAdminBreadcrumbs(["dashboard.breadcrumbs.onboarding"])}
      />
      <DashboardSection title={t("opsAdmin.onboarding.sectionItem")}>
        <form onSubmit={save} className="dash-ui-form" style={{ display: "grid", gap: 10, maxWidth: 720 }}>
          {!editingId ? (
            <label>
              {t("opsAdmin.onboarding.fieldKey")}
              <input value={form.key} onChange={(e) => setForm((f) => ({ ...f, key: e.target.value }))} required={!editingId} />
            </label>
          ) : (
            <p>{t("opsAdmin.onboarding.editingKey", { key: form.key })}</p>
          )}
          <label>
            {t("opsAdmin.onboarding.fieldTitle")}
            <input value={form.title} onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))} required />
          </label>
          <label>
            {t("opsAdmin.onboarding.fieldBody")}
            <textarea rows={4} value={form.body} onChange={(e) => setForm((f) => ({ ...f, body: e.target.value }))} required />
          </label>
          <label>
            {t("opsAdmin.onboarding.fieldCtaLabel")}
            <input value={form.ctaLabel} onChange={(e) => setForm((f) => ({ ...f, ctaLabel: e.target.value }))} />
          </label>
          <label>
            {t("opsAdmin.onboarding.fieldCtaUrl")}
            <input value={form.ctaUrl} onChange={(e) => setForm((f) => ({ ...f, ctaUrl: e.target.value }))} placeholder="/dashboard/freelancer/..." />
          </label>
          <label>
            {t("opsAdmin.onboarding.fieldCondition")}
            <select value={form.conditionKey} onChange={(e) => setForm((f) => ({ ...f, conditionKey: e.target.value }))}>
              {CONDITIONS.map((key) => (
                <option key={key} value={key}>
                  {key}
                </option>
              ))}
            </select>
          </label>
          <label>
            {t("opsAdmin.onboarding.fieldType")}
            <select value={form.itemType} onChange={(e) => setForm((f) => ({ ...f, itemType: e.target.value }))}>
              <option value="informational">informational</option>
              <option value="required">required</option>
            </select>
          </label>
          <label>
            {t("opsAdmin.onboarding.fieldPlacement")}
            <select value={form.placement} onChange={(e) => setForm((f) => ({ ...f, placement: e.target.value }))}>
              <option value="dashboard_banner">dashboard_banner</option>
              <option value="getting_started">getting_started</option>
              <option value="inline_help">inline_help</option>
              <option value="modal">modal</option>
            </select>
          </label>
          <label>
            {t("opsAdmin.onboarding.fieldSortOrder")}
            <input type="number" value={form.sortOrder} onChange={(e) => setForm((f) => ({ ...f, sortOrder: e.target.value }))} />
          </label>
          <label>
            <input
              type="checkbox"
              checked={form.isDismissible}
              onChange={(e) => setForm((f) => ({ ...f, isDismissible: e.target.checked }))}
            />{" "}
            {t("opsAdmin.onboarding.dismissible")}
          </label>
          <button type="submit" className="btn btn-primary" disabled={saving}>
            {saving ? t("opsAdmin.common.saving") : editingId ? t("opsAdmin.onboarding.saveEdit") : t("opsAdmin.onboarding.create")}
          </button>
        </form>
      </DashboardSection>
      <DashboardSection title={t("opsAdmin.onboarding.sectionList")}>
        {loading ? <DashboardLoadingState /> : null}
        {!loading && error ? <DashboardErrorState message={error} onRetry={load} /> : null}
        {!loading && !error ? (
          <div className="table-wrap max-w-full overflow-x-auto">
            <table className="dash-ui-table">
              <thead>
                <tr>
                  <th>{t("opsAdmin.onboarding.colKey")}</th>
                  <th>{t("opsAdmin.onboarding.colTitle")}</th>
                  <th>{t("opsAdmin.onboarding.colCondition")}</th>
                  <th>{t("opsAdmin.onboarding.colPlacement")}</th>
                  <th>{t("opsAdmin.onboarding.colEnabled")}</th>
                  <th>{t("opsAdmin.onboarding.colViews")}</th>
                  <th>{t("opsAdmin.onboarding.colClicks")}</th>
                  <th>{t("opsAdmin.onboarding.colDismissals")}</th>
                  <th>{t("opsAdmin.onboarding.colCompletions")}</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {items.map((item) => (
                  <tr key={item.id}>
                    <td>{item.key}</td>
                    <td>{item.title}</td>
                    <td>{item.conditionKey}</td>
                    <td>{item.placement}</td>
                    <td>{item.isEnabled ? t("opsAdmin.common.yes") : t("opsAdmin.common.no")}</td>
                    <td>{item.stats?.views ?? 0}</td>
                    <td>{item.stats?.ctaClicks ?? 0}</td>
                    <td>{item.stats?.dismissals ?? 0}</td>
                    <td>{item.stats?.completions ?? 0}</td>
                    <td>
                      <button type="button" onClick={() => startEdit(item)}>
                        {t("opsAdmin.common.edit")}
                      </button>{" "}
                      {item.isEnabled ? (
                        <button type="button" onClick={() => void toggleEnabled(item)}>
                          {t("opsAdmin.onboarding.disable")}
                        </button>
                      ) : (
                        <button type="button" onClick={() => void toggleEnabled(item)}>
                          {t("opsAdmin.onboarding.enable")}
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : null}
      </DashboardSection>
    </DashboardShell>
  );
}
