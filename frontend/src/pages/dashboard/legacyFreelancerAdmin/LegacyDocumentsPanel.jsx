import { useCallback, useEffect, useState } from "react";
import {
  listLegacyDocumentTypesRequest,
  createLegacyDocumentTypeRequest,
  updateLegacyDocumentTypeRequest,
  listLegacyFreelancerInvitesRequest,
  getLegacyCampaignDocumentRequirementsRequest,
  putLegacyCampaignDocumentRequirementsRequest,
} from "../../../services/api";
import Button from "../../../components/ui/Button";
import { useToast } from "../../../components/ui/toastContext";
import { getSafeApiErrorMessage } from "../../../utils/apiErrorMessage";
import DashboardSection from "../../../components/dashboard/DashboardSection";
import DashboardEmptyState from "../../../components/dashboard/DashboardEmptyState";
import DashboardLoadingState from "../../../components/dashboard/DashboardLoadingState";
import DashboardTable from "../../../components/dashboard/DashboardTable";
import StatusBadge from "../../../components/dashboard/StatusBadge";
import { useTranslation } from "../../../i18n/LanguageProvider";

export default function LegacyDocumentsPanel({ selectedCampaignId, onSelectedCampaignIdChange }) {
  const { t } = useTranslation();
  const { pushToast } = useToast();
  const [loadingTypes, setLoadingTypes] = useState(true);
  const [types, setTypes] = useState([]);
  const [campaigns, setCampaigns] = useState([]);
  const [reqs, setReqs] = useState([]);
  const [reqsBusy, setReqsBusy] = useState(false);
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState({ code: "", labelAr: "", description: "", sortOrder: 100 });

  const loadTypes = useCallback(async () => {
    setLoadingTypes(true);
    try {
      const res = await listLegacyDocumentTypesRequest({ includeInactive: true });
      setTypes(Array.isArray(res?.data) ? res.data : []);
    } catch (err) {
      pushToast({ type: "error", message: getSafeApiErrorMessage(err, t("legacy.toast.loadDocTypesFailed")) });
    } finally {
      setLoadingTypes(false);
    }
  }, [pushToast]);

  const loadCampaigns = useCallback(async () => {
    try {
      const res = await listLegacyFreelancerInvitesRequest();
      setCampaigns(Array.isArray(res?.data) ? res.data : []);
    } catch {
      setCampaigns([]);
    }
  }, []);

  const loadReqs = useCallback(
    async (campaignId) => {
      if (!campaignId) {
        setReqs([]);
        return;
      }
      try {
        const res = await getLegacyCampaignDocumentRequirementsRequest(campaignId);
        setReqs(Array.isArray(res?.data) ? res.data : []);
      } catch (err) {
        pushToast({ type: "error", message: getSafeApiErrorMessage(err, t("legacy.toast.loadCampaignReqsFailed")) });
      }
    },
    [pushToast],
  );

  useEffect(() => {
    loadTypes();
    loadCampaigns();
  }, [loadTypes, loadCampaigns]);

  useEffect(() => {
    loadReqs(selectedCampaignId);
  }, [selectedCampaignId, loadReqs]);

  const onCreateType = async (e) => {
    e.preventDefault();
    setCreating(true);
    try {
      await createLegacyDocumentTypeRequest({
        code: form.code,
        labelAr: form.labelAr,
        description: form.description || null,
        sortOrder: Number(form.sortOrder) || 100,
        isActive: true,
      });
      setForm({ code: "", labelAr: "", description: "", sortOrder: 100 });
      pushToast({ type: "success", message: t("legacy.toast.docTypeCreated") });
      await loadTypes();
    } catch (err) {
      pushToast({ type: "error", message: getSafeApiErrorMessage(err, t("legacy.toast.createDocTypeFailed")) });
    } finally {
      setCreating(false);
    }
  };

  const toggleTypeActive = async (row) => {
    try {
      await updateLegacyDocumentTypeRequest(row.id, { isActive: !row.isActive });
      await loadTypes();
    } catch (err) {
      pushToast({ type: "error", message: getSafeApiErrorMessage(err, t("legacy.toast.updateFailed")) });
    }
  };

  const updateReqLocal = (documentTypeId, patch) => {
    setReqs((prev) =>
      prev.map((r) => (String(r.documentTypeId) === String(documentTypeId) ? { ...r, ...patch } : r)),
    );
  };

  const saveReqs = async () => {
    if (!selectedCampaignId) return;
    setReqsBusy(true);
    try {
      const payload = reqs.map((r, i) => ({
        documentTypeId: r.documentTypeId,
        isEnabled: Boolean(r.isEnabled),
        isRequired: Boolean(r.isEnabled) && Boolean(r.isRequired),
        sortOrder: Number(r.sortOrder) || i * 10,
      }));
      const res = await putLegacyCampaignDocumentRequirementsRequest(selectedCampaignId, payload);
      setReqs(Array.isArray(res?.data) ? res.data : []);
      pushToast({ type: "success", message: t("legacy.toast.campaignDocsSaved") });
    } catch (err) {
      pushToast({ type: "error", message: getSafeApiErrorMessage(err, t("legacy.toast.saveCampaignDocsFailed")) });
    } finally {
      setReqsBusy(false);
    }
  };

  const selectedCampaign = campaigns.find((c) => String(c.id) === String(selectedCampaignId));

  return (
    <>
      <DashboardSection
        title={t("legacy.campaigns.docsCatalogTitle")}
        description={t("legacy.campaigns.docsCatalogDesc")}
        actions={
          <Button type="button" variant="secondary" onClick={loadTypes} disabled={loadingTypes}>
            {t("legacy.common.refresh")}
          </Button>
        }
      >
        <form className="oh-legacy-admin__form-grid oh-legacy-admin__form-grid--2" onSubmit={onCreateType} style={{ marginBottom: "1.25rem" }}>
          <label className="oh-sa-users-field">
            <span>{t("legacy.common.codeField")}</span>
            <input
              required
              dir="ltr"
              value={form.code}
              onChange={(e) => setForm((f) => ({ ...f, code: e.target.value }))}
              placeholder="CONTRACTOR_AGREEMENT"
            />
          </label>
          <label className="oh-sa-users-field">
            <span>{t("legacy.common.nameAr")}</span>
            <input
              required
              value={form.labelAr}
              onChange={(e) => setForm((f) => ({ ...f, labelAr: e.target.value }))}
            />
          </label>
          <label className="oh-sa-users-field oh-legacy-admin__form-span">
            <span>{t("legacy.common.descriptionOptional")}</span>
            <input
              value={form.description}
              onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
            />
          </label>
          <label className="oh-sa-users-field">
            <span>{t("legacy.common.order")}</span>
            <input
              type="number"
              value={form.sortOrder}
              onChange={(e) => setForm((f) => ({ ...f, sortOrder: e.target.value }))}
            />
          </label>
          <div className="oh-sa-users-filters__actions">
            <Button type="submit" disabled={creating}>
              {creating ? t("legacy.common.creating") : t("legacy.common.addDocumentType")}
            </Button>
          </div>
        </form>

        {loadingTypes ? (
          <DashboardLoadingState />
        ) : types.length === 0 ? (
          <DashboardEmptyState title={t("legacy.campaigns.noDocTypes")} />
        ) : (
          <div className="oh-sa-users-table-wrap">
            <DashboardTable caption={t("legacy.campaigns.docTypesCaption")}>
              <thead>
                <tr>
                  <th scope="col">{t("legacy.common.code")}</th>
                  <th scope="col">{t("legacy.common.name")}</th>
                  <th scope="col">{t("legacy.common.order")}</th>
                  <th scope="col">{t("legacy.common.status")}</th>
                  <th scope="col">{t("legacy.common.action")}</th>
                </tr>
              </thead>
              <tbody>
                {types.map((row) => (
                  <tr key={row.id}>
                    <td dir="ltr">
                      <span className="oh-legacy-admin__member-id">{row.code}</span>
                    </td>
                    <td>
                      <div className="oh-sa-users-user">
                        <strong>{row.labelAr}</strong>
                        {row.description ? <span>{row.description}</span> : null}
                      </div>
                    </td>
                    <td>{row.sortOrder}</td>
                    <td>
                      <StatusBadge tone={row.isActive ? "success" : "danger"}>
                        {row.isActive ? t("legacy.common.active") : t("legacy.common.disabled")}
                      </StatusBadge>
                    </td>
                    <td>
                      <Button type="button" variant="secondary" onClick={() => toggleTypeActive(row)}>
                        {row.isActive ? t("legacy.common.deactivate") : t("legacy.common.enable")}
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </DashboardTable>
          </div>
        )}
      </DashboardSection>

      <DashboardSection
        title={t("legacy.campaigns.docsAdminTitle")}
        description={t("legacy.campaigns.docsAdminDescPanel")}
        actions={
          selectedCampaignId ? (
            <Button type="button" disabled={reqsBusy || !reqs.length} onClick={saveReqs}>
              {reqsBusy ? t("legacy.common.saving") : t("legacy.common.saveCampaignRequirements")}
            </Button>
          ) : null
        }
      >
        <label className="oh-sa-users-field" style={{ maxWidth: "28rem", marginBottom: "1rem" }}>
          <span>{t("legacy.common.campaign")}</span>
          <select
            value={selectedCampaignId || ""}
            onChange={(e) => onSelectedCampaignIdChange(e.target.value || null)}
          >
            <option value="">{t("legacy.common.selectCampaign")}</option>
            {campaigns.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name} ({c.slug})
              </option>
            ))}
          </select>
        </label>

        {!selectedCampaignId ? (
          <DashboardEmptyState title={t("legacy.campaigns.chooseCampaignEmpty")} description={t("legacy.campaigns.chooseCampaignEmptyDesc")} />
        ) : (
          <>
            <p className="oh-legacy-admin__notice oh-legacy-admin__notice--info">
              {t("legacy.common.selectedCampaign")}: <strong>{selectedCampaign?.name || "—"}</strong>
            </p>
            {reqs.length === 0 ? (
              <DashboardEmptyState title={t("legacy.campaigns.noRequirementsYet")} />
            ) : (
              <div className="oh-sa-users-table-wrap">
                <DashboardTable caption={t("legacy.campaigns.requirementsCaption")}>
                  <thead>
                    <tr>
                      <th scope="col">{t("legacy.common.document")}</th>
                      <th scope="col">{t("legacy.common.inList")}</th>
                      <th scope="col">{t("legacy.common.mustVerify")}</th>
                      <th scope="col">{t("legacy.common.order")}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {reqs.map((r) => (
                      <tr key={r.documentTypeId}>
                        <td>
                          <div className="oh-sa-users-user">
                            <strong>{r.labelAr}</strong>
                            <span dir="ltr">{r.code}</span>
                          </div>
                        </td>
                        <td>
                          <input
                            type="checkbox"
                            checked={Boolean(r.isEnabled)}
                            onChange={(e) =>
                              updateReqLocal(r.documentTypeId, {
                                isEnabled: e.target.checked,
                                isRequired: e.target.checked ? r.isRequired : false,
                              })
                            }
                          />
                        </td>
                        <td>
                          <input
                            type="checkbox"
                            disabled={!r.isEnabled}
                            checked={Boolean(r.isRequired)}
                            onChange={(e) => updateReqLocal(r.documentTypeId, { isRequired: e.target.checked })}
                          />
                        </td>
                        <td>
                          <input
                            type="number"
                            style={{ width: "5rem", padding: "8px 10px", borderRadius: 10, border: "1px solid rgba(91,102,132,0.22)" }}
                            value={r.sortOrder}
                            onChange={(e) =>
                              updateReqLocal(r.documentTypeId, { sortOrder: Number(e.target.value) || 0 })
                            }
                          />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </DashboardTable>
              </div>
            )}
          </>
        )}
      </DashboardSection>
    </>
  );
}
