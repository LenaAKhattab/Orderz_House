import { useCallback, useEffect, useMemo, useState } from "react";
import {
  listLegacyFreelancersRequest,
  getLegacyFreelancerRequest,
  createLegacyFreelancerRequest,
  bulkAssignLegacyFreelancerPackageRequest,
  assignLegacyFreelancerPackageRequest,
  setLegacyFreelancerSignedDocumentRequest,
  removeLegacyFreelancerSignedDocumentRequest,
  addLegacyFreelancerHistoricalMoneyRequest,
  voidLegacyFreelancerHistoricalMoneyRequest,
  replaceLegacyFreelancerIdentityRequest,
  listLegacyDocumentTypesRequest,
  listLegacyFreelancerAssignablePackagesRequest,
  adminListInstitutionsRequest,
} from "../../../services/api";
import Button from "../../../components/ui/Button";
import { useToast } from "../../../components/ui/toastContext";
import { getSafeApiErrorMessage } from "../../../utils/apiErrorMessage";
import DashboardSection from "../../../components/dashboard/DashboardSection";
import DashboardEmptyState from "../../../components/dashboard/DashboardEmptyState";
import DashboardLoadingState from "../../../components/dashboard/DashboardLoadingState";
import DashboardErrorState from "../../../components/dashboard/DashboardErrorState";
import DashboardTable from "../../../components/dashboard/DashboardTable";
import StatusBadge from "../../../components/dashboard/StatusBadge";
import Pagination from "../../../components/common/Pagination";
import {
  formatDate,
  formatMoney,
  entryMethodLabel,
  identityStatusLabel,
  categoriesLabel,
  PACKAGE_DURATION_OPTIONS,
  LegacyIdentityImage,
  getDetailTabs,
} from "./legacyAdminShared";
import { useTranslation } from "../../../i18n/LanguageProvider";
import { LEGACY_WORK_FIELDS, WORK_FIELDS_REQUIRED_MESSAGE } from "../../../constants/legacyFreelancerWorkFields";
import LegacyPhoneInput from "../../../components/legacy/LegacyPhoneInput";
import LegacySmartSuggestField from "../../../components/legacy/LegacySmartSuggestField";
import LegacySearchableSelect from "../../../components/legacy/LegacySearchableSelect";
import { listJordanCityOptions, CITY_OTHER_VALUE, CITY_OTHER_LABEL_AR } from "../../../constants/jordanCities";
import { DEFAULT_DIAL_CODE, toPhonePayload } from "../../../utils/legacyPhone";

const EMPTY_CREATE = {
  firstName: "",
  fatherName: "",
  familyName: "",
  nationalId: "",
  phoneCountryCode: DEFAULT_DIAL_CODE,
  phoneNumber: "",
  email: "",
  city: "",
  residence: "",
  specialization: "",
  nationality: "",
  planId: "",
  durationMonths: "",
  historicalAmount: "",
  signedDocumentTypeIds: [],
  workFields: [],
  institutionId: "",
};

const EMPTY_FILTERS = {
  planId: "",
  identityComplete: "",
  entryMethod: "",
  isActive: "",
  workField: "",
};

/**
 * @param {{ createSignal?: number, onListChanged?: () => void, campaignId?: string|null, hideManualCreate?: boolean }} props
 */
export default function LegacyFreelancersPanel({
  createSignal = 0,
  onListChanged,
  campaignId = null,
  hideManualCreate = false,
}) {
  const { t } = useTranslation();
const { pushToast } = useToast();
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [items, setItems] = useState([]);
  const [page, setPage] = useState(1);
  const [pageSize] = useState(25);
  const [totalPages, setTotalPages] = useState(1);
  const [total, setTotal] = useState(0);
  const [selectedIds, setSelectedIds] = useState(() => new Set());
  const [q, setQ] = useState("");
  const [draftFilters, setDraftFilters] = useState({ q: "", ...EMPTY_FILTERS });
  const [filters, setFilters] = useState(EMPTY_FILTERS);
  const [plans, setPlans] = useState([]);
  const [docTypes, setDocTypes] = useState([]);
  const [institutions, setInstitutions] = useState([]);

  const [showCreate, setShowCreate] = useState(false);
  const [createForm, setCreateForm] = useState(EMPTY_CREATE);
  const [idFrontFile, setIdFrontFile] = useState(null);
  const [idBackFile, setIdBackFile] = useState(null);
  const [creating, setCreating] = useState(false);

  const [showBulk, setShowBulk] = useState(false);
  const [bulkPlanId, setBulkPlanId] = useState("");
  const [bulkDuration, setBulkDuration] = useState("3");
  const [bulkBusy, setBulkBusy] = useState(false);

  const [detailUserId, setDetailUserId] = useState(null);
  const [detail, setDetail] = useState(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailTab, setDetailTab] = useState("profile");
  const [identityRefresh, setIdentityRefresh] = useState(0);

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError("");
    try {
      const params = {
        q: q || undefined,
        page,
        pageSize,
        planId: filters.planId || undefined,
        identityComplete: filters.identityComplete || undefined,
        entryMethod: filters.entryMethod || undefined,
        isActive: filters.isActive || undefined,
        workField: filters.workField || undefined,
        campaignId: campaignId || undefined,
      };
      const res = await listLegacyFreelancersRequest(params);
      const data = res?.data || {};
      setItems(Array.isArray(data.items) ? data.items : []);
      setTotal(Number(data.total) || 0);
      setTotalPages(Number(data.totalPages) || 1);
      setSelectedIds(new Set());
    } catch (err) {
      setLoadError(getSafeApiErrorMessage(err, t("legacy.toast.loadFreelancersFailed")));
      pushToast({ type: "error", message: getSafeApiErrorMessage(err, t("legacy.toast.loadFreelancersFailed")) });
    } finally {
      setLoading(false);
    }
  }, [q, page, pageSize, filters, campaignId, pushToast]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    if (hideManualCreate) return;
    if (createSignal > 0) setShowCreate(true);
  }, [createSignal, hideManualCreate]);

  useEffect(() => {
    listLegacyFreelancerAssignablePackagesRequest()
      .then((res) => {
        const packages = res?.data?.packages || res?.packages || [];
        setPlans(Array.isArray(packages) ? packages : []);
      })
      .catch(() => setPlans([]));
    listLegacyDocumentTypesRequest({ includeInactive: false })
      .then((res) => setDocTypes(Array.isArray(res?.data) ? res.data : []))
      .catch(() => setDocTypes([]));
    adminListInstitutionsRequest({ status: "active", limit: 100 })
      .then((res) => setInstitutions(res?.data?.institutions || []))
      .catch(() => setInstitutions([]));
  }, []);

  const loadDetail = useCallback(
    async (userId) => {
      if (!userId) {
        setDetail(null);
        return;
      }
      setDetailLoading(true);
      try {
        const res = await getLegacyFreelancerRequest(userId);
        setDetail(res?.data || null);
      } catch (err) {
        pushToast({ type: "error", message: getSafeApiErrorMessage(err, t("legacy.toast.loadDetailFailed")) });
        setDetail(null);
      } finally {
        setDetailLoading(false);
      }
    },
    [pushToast],
  );

  useEffect(() => {
    if (detailUserId) loadDetail(detailUserId);
  }, [detailUserId, loadDetail]);

  const allVisibleSelected = items.length > 0 && items.every((r) => selectedIds.has(r.id));
  const selectedCount = selectedIds.size;

  const toggleAll = () => {
    if (allVisibleSelected) setSelectedIds(new Set());
    else setSelectedIds(new Set(items.map((r) => r.id)));
  };

  const toggleOne = (id) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const applyFilters = (e) => {
    e.preventDefault();
    setPage(1);
    setQ(draftFilters.q.trim());
    setFilters({
      planId: draftFilters.planId,
      identityComplete: draftFilters.identityComplete,
      entryMethod: draftFilters.entryMethod,
      isActive: draftFilters.isActive,
      campaignId: draftFilters.campaignId,
      workField: draftFilters.workField,
    });
  };

  const resetFilters = () => {
    setDraftFilters({ q: "", ...EMPTY_FILTERS });
    setQ("");
    setFilters(EMPTY_FILTERS);
    setPage(1);
  };

  const onCreate = async (e) => {
    e.preventDefault();
    setCreating(true);
    try {
      const hasFiles = Boolean(idFrontFile || idBackFile);
      const base = {
        firstName: createForm.firstName,
        fatherName: createForm.fatherName,
        familyName: createForm.familyName,
        nationalId: createForm.nationalId,
        phone: toPhonePayload({
          countryCode: createForm.phoneCountryCode,
          number: createForm.phoneNumber,
        }),
        email: createForm.email,
        city: createForm.city || undefined,
        residence: createForm.residence || undefined,
        specialization: createForm.specialization || undefined,
        nationality: createForm.nationality || undefined,
        planId: createForm.planId || undefined,
        durationMonths: createForm.durationMonths || undefined,
        historicalAmount: createForm.historicalAmount || undefined,
        signedDocumentTypeIds: createForm.signedDocumentTypeIds,
        workFields: createForm.workFields,
        institutionId: createForm.institutionId ? Number(createForm.institutionId) : undefined,
      };

      if (!base.workFields?.length) {
        pushToast({ type: "error", message: WORK_FIELDS_REQUIRED_MESSAGE });
        setCreating(false);
        return;
      }

      let payload;
      if (hasFiles) {
        payload = new FormData();
        Object.entries(base).forEach(([key, value]) => {
          if (value == null || value === "") return;
          if (key === "signedDocumentTypeIds" || key === "workFields") {
            payload.append(key, JSON.stringify(value));
          } else if (key === "phone" && typeof value === "object") {
            payload.append(key, JSON.stringify(value));
          } else {
            payload.append(key, String(value));
          }
        });
        if (idFrontFile) payload.append("idFront", idFrontFile);
        if (idBackFile) payload.append("idBack", idBackFile);
      } else {
        payload = base;
      }

      await createLegacyFreelancerRequest(payload);
      pushToast({ type: "success", message: t("legacy.toast.freelancerAdded") });
      setShowCreate(false);
      setCreateForm(EMPTY_CREATE);
      setIdFrontFile(null);
      setIdBackFile(null);
      await load();
      onListChanged?.();
    } catch (err) {
      pushToast({ type: "error", message: getSafeApiErrorMessage(err, t("legacy.toast.addFreelancerFailed")) });
    } finally {
      setCreating(false);
    }
  };

  const onBulkAssign = async () => {
    if (!bulkPlanId || !selectedCount) return;
    setBulkBusy(true);
    try {
      await bulkAssignLegacyFreelancerPackageRequest({
        userIds: [...selectedIds],
        planId: Number(bulkPlanId),
        durationMonths: Number(bulkDuration),
      });
      pushToast({ type: "success", message: t("legacy.toast.bulkAssignSuccess", { count: selectedCount }) });
      setShowBulk(false);
      await load();
      onListChanged?.();
    } catch (err) {
      pushToast({ type: "error", message: getSafeApiErrorMessage(err, t("legacy.toast.bulkAssignFailed")) });
    } finally {
      setBulkBusy(false);
    }
  };

  const planOptions = useMemo(
    () =>
      plans.map((p) => {
        const name =
          p.displayName || p.title || p.name || p.tierCode?.toUpperCase() || `#${p.id || p.planId}`;
        const price =
          p.monthlyPriceJod != null && Number.isFinite(Number(p.monthlyPriceJod))
            ? Number(p.monthlyPriceJod)
            : null;
        const label =
          price != null
            ? `${name}${price > 0 ? ` — ${price}${t("legacy.common.planJodSuffix")}` : t("legacy.common.planFreeSuffix")}`
            : name;
        return {
          id: String(p.planId || p.id),
          label,
        };
      }),
    [plans],
  );

  return (
    <>
      <DashboardSection
        title={t("legacy.common.manageFreelancers")}
        description={loading ? t("legacy.common.loading") : t("legacy.common.resultsCount", { count: total })}
        actions={
          <Button type="button" variant="secondary" onClick={load} disabled={loading}>
            {t("legacy.common.refresh")}
          </Button>
        }
      >
        <form className="oh-legacy-admin__toolbar" onSubmit={applyFilters}>
          <label className="oh-sa-users-field oh-legacy-admin__toolbar-search">
            <span>{t("legacy.common.search")}</span>
            <input
              value={draftFilters.q}
              onChange={(e) => setDraftFilters((s) => ({ ...s, q: e.target.value }))}
              placeholder={t("legacy.filters.searchPlaceholder")}
            />
          </label>
          <label className="oh-sa-users-field oh-legacy-admin__toolbar-field">
            <span>{t("legacy.detailTabs.package")}</span>
            <select
              value={draftFilters.planId}
              onChange={(e) => setDraftFilters((s) => ({ ...s, planId: e.target.value }))}
            >
              <option value="">{t("legacy.common.all")}</option>
              {planOptions.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.label}
                </option>
              ))}
            </select>
          </label>
          <label className="oh-sa-users-field oh-legacy-admin__toolbar-field">
            <span>{t("legacy.join.identitySection")}</span>
            <select
              value={draftFilters.identityComplete}
              onChange={(e) => setDraftFilters((s) => ({ ...s, identityComplete: e.target.value }))}
            >
              <option value="">{t("legacy.common.all")}</option>
              <option value="true">{t("legacy.common.complete")}</option>
              <option value="false">{t("legacy.common.incomplete")}</option>
            </select>
          </label>
          <label className="oh-sa-users-field oh-legacy-admin__toolbar-field">
            <span>{t("legacy.common.entryMethod")}</span>
            <select
              value={draftFilters.entryMethod}
              onChange={(e) => setDraftFilters((s) => ({ ...s, entryMethod: e.target.value }))}
            >
              <option value="">{t("legacy.common.all")}</option>
              <option value="SHARED_INVITE">{t("legacy.entryMethod.sharedInvite")}</option>
              <option value="ADMIN_MANUAL">{t("legacy.entryMethod.adminManual")}</option>
            </select>
          </label>
          <label className="oh-sa-users-field oh-legacy-admin__toolbar-field">
            <span>{t("legacy.common.accountStatus")}</span>
            <select
              value={draftFilters.isActive}
              onChange={(e) => setDraftFilters((s) => ({ ...s, isActive: e.target.value }))}
            >
              <option value="">{t("legacy.common.all")}</option>
              <option value="true">{t("legacy.center.stats.active")}</option>
              <option value="false">{t("legacy.common.inactive")}</option>
            </select>
          </label>
          <label className="oh-sa-users-field oh-legacy-admin__toolbar-field">
            <span>{t("legacy.join.workFieldSection")}</span>
            <select
              value={draftFilters.workField}
              onChange={(e) => setDraftFilters((s) => ({ ...s, workField: e.target.value }))}
            >
              <option value="">{t("legacy.common.all")}</option>
              {LEGACY_WORK_FIELDS.map((wf) => (
                <option key={wf.key} value={wf.key}>
                  {wf.labelAr}
                </option>
              ))}
            </select>
          </label>
          <div className="oh-legacy-admin__toolbar-actions">
            <Button type="submit">{t("legacy.common.apply")}</Button>
            <Button type="button" variant="secondary" onClick={resetFilters}>
              {t("legacy.common.reset")}
            </Button>
          </div>
        </form>

        {selectedCount > 0 ? (
          <div className="oh-sa-users-bulk" role="region" aria-label={t("legacy.common.bulkActions")} style={{ marginBottom: "0.85rem" }}>
            <span className="oh-sa-users-bulk__count">{t("legacy.common.selectedCount", { count: selectedCount })}</span>
            <Button type="button" onClick={() => setShowBulk(true)}>
              {t("legacy.common.assignPackage")}
            </Button>
            <Button type="button" variant="secondary" onClick={() => setSelectedIds(new Set())}>
              {t("legacy.common.clearSelection")}
            </Button>
          </div>
        ) : null}

        {loading ? (
          <DashboardLoadingState />
        ) : loadError ? (
          <DashboardErrorState
            message={loadError}
            actions={
              <Button type="button" variant="secondary" onClick={load}>
                {t("legacy.common.retry")}
              </Button>
            }
          />
        ) : items.length === 0 ? (
          <DashboardEmptyState
            title={t("legacy.common.noFreelancers")}
            description={t("legacy.common.noFreelancersDesc")}
          />
        ) : (
          <>
            <div className="oh-sa-users-table-wrap">
              <DashboardTable caption={t("legacy.common.freelancersListCaption")}>
                <thead>
                  <tr>
                    <th scope="col">
                      <input
                        type="checkbox"
                        checked={allVisibleSelected}
                        onChange={toggleAll}
                        aria-label={t("legacy.common.selectAll")}
                      />
                    </th>
                    <th scope="col">{t("legacy.common.membershipId")}</th>
                    <th scope="col">{t("legacy.common.fullName")}</th>
                    <th scope="col">{t("legacy.join.workFieldSection")}</th>
                    <th scope="col">{t("legacy.common.contact")}</th>
                    <th scope="col">{t("legacy.common.entryMethod")}</th>
                    <th scope="col">{t("legacy.detailTabs.package")}</th>
                    <th scope="col">{t("legacy.join.identitySection")}</th>
                    <th scope="col">{t("legacy.common.documents")}</th>
                    <th scope="col">{t("legacy.common.historicalAmounts")}</th>
                    <th scope="col">{t("legacy.common.status")}</th>
                    <th scope="col">{t("legacy.common.actions")}</th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((row) => (
                    <tr key={row.id} className={selectedIds.has(row.id) ? "oh-legacy-admin__selected-row" : undefined}>
                      <td>
                        <input
                          type="checkbox"
                          checked={selectedIds.has(row.id)}
                          onChange={() => toggleOne(row.id)}
                          aria-label={t("legacy.common.selectRow", { name: row.fullName })}
                        />
                      </td>
                      <td>
                        <span className="oh-legacy-admin__member-id">
                          {row.freelancerMemberIdMasked || "—"}
                        </span>
                      </td>
                      <td>
                        <div className="oh-sa-users-user">
                          <strong>{row.fullName}</strong>
                          <span>{categoriesLabel(row.categories)}</span>
                        </div>
                      </td>
                      <td>
                        {row.workFields?.isEmpty || !(row.workFields?.labels || []).length ? (
                          <span className="oh-legacy-admin__muted">{t("legacy.common.notSet")}</span>
                        ) : (
                          <div className="oh-legacy-work-chips">
                            {(row.workFields?.labels || []).map((lbl) => (
                              <span key={lbl} className="oh-legacy-work-chip">
                                {lbl}
                              </span>
                            ))}
                          </div>
                        )}
                      </td>
                      <td>
                        <div className="oh-sa-users-user">
                          <span dir="ltr">{row.phone || "—"}</span>
                          <span dir="ltr">{row.email || "—"}</span>
                        </div>
                      </td>
                      <td>
                        <StatusBadge
                          tone={row.legacyEntryMethod === "ADMIN_MANUAL" ? "admin_assigned" : "neutral"}
                        >
                          {entryMethodLabel(row.legacyEntryMethod, t)}
                        </StatusBadge>
                      </td>
                      <td>
                        <div className="oh-sa-users-plan-cell">
                          <strong>{row.plan?.title || row.plan?.name || "—"}</strong>
                          <span className="oh-sa-users-muted">{formatDate(row.plan?.expiresAt)}</span>
                        </div>
                      </td>
                      <td>
                        <StatusBadge tone={row.identity?.complete ? "success" : "warning"}>
                          {identityStatusLabel(row.identity, t)}
                        </StatusBadge>
                      </td>
                      <td>{row.signedDocuments?.count ?? 0}</td>
                      <td>{formatMoney(row.historicalMoney?.total, row.historicalMoney?.currency)}</td>
                      <td>
                        <StatusBadge tone={row.isActive ? "success" : "danger"}>
                          {row.isActive ? t("legacy.common.active") : t("legacy.common.inactive")}
                        </StatusBadge>
                      </td>
                      <td>
                        <div className="oh-sa-users-table__actions">
                          <Button
                            type="button"
                            variant="secondary"
                            onClick={() => {
                              setDetailTab("profile");
                              setDetailUserId(row.id);
                            }}
                          >
                            {t("legacy.common.viewManage")}
                          </Button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </DashboardTable>
            </div>
            <div className="oh-legacy-admin__pager">
              <p className="oh-legacy-admin__pager-meta">
                {t("legacy.common.pageOf", { page, total: totalPages })}
              </p>
              <Pagination currentPage={page} totalPages={totalPages} onPageChange={setPage} isLoading={loading} />
            </div>
          </>
        )}
      </DashboardSection>

      {showCreate ? (
        <div className="oh-sa-users-modal" role="dialog" aria-modal="true" aria-labelledby="oh-legacy-create-title">
          <button type="button" className="oh-sa-users-modal__backdrop" aria-label={t("legacy.common.close")} onClick={() => setShowCreate(false)} />
          <div className="oh-sa-users-modal__panel" style={{ width: "min(720px, 100%)", maxHeight: "min(92vh, 900px)" }}>
            <header className="oh-sa-users-modal__header">
              <h2 id="oh-legacy-create-title">{t("legacy.common.addLegacyModalTitle")}</h2>
              <button type="button" className="oh-sa-users-modal__close" onClick={() => setShowCreate(false)} aria-label={t("legacy.common.close")}>
                ×
              </button>
            </header>
            <form className="oh-sa-users-modal__body" onSubmit={onCreate}>
              <div className="oh-legacy-admin__form-grid oh-legacy-admin__form-grid--2">
                {[
                  ["firstName", "legacy.common.firstName", true],
                  ["fatherName", "legacy.common.fatherName", true],
                  ["familyName", "legacy.common.familyName", true],
                  ["nationalId", "legacy.common.nationalId", true, true],
                ].map(([key, labelKey, required, ltr]) => (
                  <label key={key} className="oh-sa-users-field">
                    <span>{t(labelKey)}</span>
                    <input
                      required={required}
                      dir={ltr ? "ltr" : undefined}
                      value={createForm[key]}
                      onChange={(e) => setCreateForm((f) => ({ ...f, [key]: e.target.value }))}
                    />
                  </label>
                ))}
                <div className="oh-sa-users-field">
                  <span id="oh-legacy-create-phone-label">{t("legacy.common.phoneRequired")}</span>
                  <LegacyPhoneInput
                    id="oh-legacy-create-phone"
                    variant="admin"
                    required
                    countryCode={createForm.phoneCountryCode}
                    number={createForm.phoneNumber}
                    onCountryCodeChange={(v) => setCreateForm((f) => ({ ...f, phoneCountryCode: v }))}
                    onNumberChange={(v) => setCreateForm((f) => ({ ...f, phoneNumber: v }))}
                    aria-labelledby="oh-legacy-create-phone-label"
                  />
                </div>
                <label className="oh-sa-users-field oh-legacy-admin__form-span">
                  <span>{t("legacy.common.emailRequired")}</span>
                  <input
                    required
                    type="email"
                    dir="ltr"
                    value={createForm.email}
                    onChange={(e) => setCreateForm((f) => ({ ...f, email: e.target.value }))}
                  />
                </label>
                <div className="oh-sa-users-field oh-legacy-admin__form-span">
                  <span>{t("legacy.common.workField")} *</span>
                  <div className="oh-legacy-admin__doc-checks" style={{ marginTop: "0.4rem" }}>
                    {LEGACY_WORK_FIELDS.map((wf) => {
                      const checked = createForm.workFields.includes(wf.key);
                      return (
                        <label key={wf.key} className="oh-legacy-admin__check">
                          <input
                            type="checkbox"
                            checked={checked}
                            onChange={(e) => {
                              setCreateForm((f) => {
                                const set = new Set(f.workFields);
                                if (e.target.checked) set.add(wf.key);
                                else set.delete(wf.key);
                                return { ...f, workFields: [...set] };
                              });
                            }}
                          />
                          {wf.labelAr}
                        </label>
                      );
                    })}
                  </div>
                </div>
                <label className="oh-sa-users-field">
                  <span>{t("legacy.common.city")}</span>
                  <LegacySearchableSelect
                    className="oh-legacy-smart--admin"
                    value={createForm.city}
                    onChange={(v) => setCreateForm((f) => ({ ...f, city: v }))}
                    options={listJordanCityOptions()}
                    allowOther
                    otherValue={CITY_OTHER_VALUE}
                    otherLabel={CITY_OTHER_LABEL_AR}
                    otherInputLabel={t("legacy.common.writeCityName")}
                  />
                </label>
                <label className="oh-sa-users-field">
                  <span>{t("legacy.common.residence")}</span>
                  <LegacySmartSuggestField
                    fieldKey="residence_area"
                    className="oh-legacy-smart--admin"
                    value={createForm.residence}
                    onChange={(v) => setCreateForm((f) => ({ ...f, residence: v }))}
                  />
                </label>
                <label className="oh-sa-users-field">
                  <span>{t("legacy.common.specialization")}</span>
                  <LegacySmartSuggestField
                    fieldKey="specialization"
                    className="oh-legacy-smart--admin"
                    value={createForm.specialization}
                    onChange={(v) => setCreateForm((f) => ({ ...f, specialization: v }))}
                  />
                </label>
                <label className="oh-sa-users-field">
                  <span>{t("legacy.common.nationality")}</span>
                  <LegacySmartSuggestField
                    fieldKey="nationality"
                    className="oh-legacy-smart--admin"
                    value={createForm.nationality}
                    onChange={(v) => setCreateForm((f) => ({ ...f, nationality: v }))}
                  />
                </label>
                <label className="oh-sa-users-field oh-legacy-admin__form-span">
                  <span>{t("legacy.common.optionalInstitution")}</span>
                  <select
                    value={createForm.institutionId}
                    onChange={(e) => setCreateForm((f) => ({ ...f, institutionId: e.target.value }))}
                  >
                    <option value="">{t("legacy.common.none")}</option>
                    {institutions.map((i) => (
                      <option key={i.id} value={i.id}>
                        {i.name}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="oh-sa-users-field">
                  <span>{t("legacy.common.optionalPackage")}</span>
                  <select
                    value={createForm.planId}
                    onChange={(e) => setCreateForm((f) => ({ ...f, planId: e.target.value }))}
                  >
                    <option value="">{t("legacy.common.defaultPlan")}</option>
                    {planOptions.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.label}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="oh-sa-users-field">
                  <span>{t("legacy.common.durationMonthsPackage")}</span>
                  <select
                    value={createForm.durationMonths}
                    onChange={(e) => setCreateForm((f) => ({ ...f, durationMonths: e.target.value }))}
                  >
                    <option value="">{t("legacy.common.noDuration")}</option>
                    {PACKAGE_DURATION_OPTIONS.map((m) => (
                      <option key={m} value={m}>
                        {m}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="oh-sa-users-field">
                  <span>{t("legacy.common.optionalHistorical")}</span>
                  <input
                    type="number"
                    min={0}
                    step="0.01"
                    dir="ltr"
                    value={createForm.historicalAmount}
                    onChange={(e) => setCreateForm((f) => ({ ...f, historicalAmount: e.target.value }))}
                  />
                </label>
                <div className="oh-legacy-admin__form-span">
                  <p className="oh-sa-users-muted" style={{ marginBottom: "0.5rem", fontWeight: 800 }}>
                    {t("legacy.common.signedDocsTitle")}
                    <span className="oh-legacy-admin__muted" style={{ display: "block", fontWeight: 400 }}>
                      {t("legacy.common.adminOnly")}
                    </span>
                  </p>
                  <div className="oh-legacy-admin__form-grid">
                    {docTypes.map((t) => {
                      const checked = createForm.signedDocumentTypeIds.includes(String(t.id));
                      return (
                        <label key={t.id} className="oh-legacy-admin__doc-card" style={{ cursor: "pointer" }}>
                          <span>{t.labelAr}</span>
                          <input
                            type="checkbox"
                            checked={checked}
                            onChange={(e) => {
                              setCreateForm((f) => {
                                const id = String(t.id);
                                const set = new Set(f.signedDocumentTypeIds.map(String));
                                if (e.target.checked) set.add(id);
                                else set.delete(id);
                                return { ...f, signedDocumentTypeIds: [...set] };
                              });
                            }}
                          />
                        </label>
                      );
                    })}
                  </div>
                </div>
                <label className="oh-sa-users-field">
                  <span>{t("legacy.common.idFront")}</span>
                  <input type="file" accept="image/*" onChange={(e) => setIdFrontFile(e.target.files?.[0] || null)} />
                </label>
                <label className="oh-sa-users-field">
                  <span>{t("legacy.common.idBack")}</span>
                  <input type="file" accept="image/*" onChange={(e) => setIdBackFile(e.target.files?.[0] || null)} />
                </label>
              </div>
              <div className="oh-sa-users-modal__footer">
                <Button type="button" variant="secondary" onClick={() => setShowCreate(false)}>
                  {t("legacy.common.cancel")}
                </Button>
                <Button type="submit" disabled={creating}>
                  {creating ? t("legacy.common.saving") : t("legacy.common.save")}
                </Button>
              </div>
            </form>
          </div>
        </div>
      ) : null}

      {showBulk ? (
        <div className="oh-sa-users-modal" role="dialog" aria-modal="true" aria-labelledby="oh-legacy-bulk-title">
          <button type="button" className="oh-sa-users-modal__backdrop" aria-label={t("legacy.common.close")} onClick={() => setShowBulk(false)} />
          <div className="oh-sa-users-modal__panel">
            <header className="oh-sa-users-modal__header">
              <h2 id="oh-legacy-bulk-title">{t("legacy.common.bulkAssignTitle")}</h2>
              <button type="button" className="oh-sa-users-modal__close" onClick={() => setShowBulk(false)} aria-label={t("legacy.common.close")}>
                ×
              </button>
            </header>
            <div className="oh-sa-users-modal__body">
              <p className="oh-sa-users-modal__desc">
                {t("legacy.common.bulkAssignDesc", { count: selectedCount })}
              </p>
              <label className="oh-sa-users-field">
                <span>{t("legacy.detailTabs.package")}</span>
                <select value={bulkPlanId} onChange={(e) => setBulkPlanId(e.target.value)}>
                  <option value="">{t("legacy.common.select")}</option>
                  {planOptions.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.label}
                    </option>
                  ))}
                </select>
              </label>
              <label className="oh-sa-users-field">
                <span>{t("legacy.common.durationMonths")}</span>
                <select value={bulkDuration} onChange={(e) => setBulkDuration(e.target.value)}>
                  {PACKAGE_DURATION_OPTIONS.map((m) => (
                    <option key={m} value={m}>
                      {m}
                    </option>
                  ))}
                </select>
              </label>
              <div className="oh-sa-users-modal__footer">
                <Button type="button" variant="secondary" onClick={() => setShowBulk(false)}>
                  {t("legacy.common.cancel")}
                </Button>
                <Button type="button" disabled={bulkBusy || !bulkPlanId} onClick={onBulkAssign}>
                  {bulkBusy ? t("legacy.common.assigning") : t("legacy.common.confirm")}
                </Button>
              </div>
            </div>
          </div>
        </div>
      ) : null}

      {detailUserId ? (
        <LegacyFreelancerDetailDrawer
          detail={detail}
          loading={detailLoading}
          detailTab={detailTab}
          setDetailTab={setDetailTab}
          identityRefresh={identityRefresh}
          planOptions={planOptions}
          docTypes={docTypes}
          onClose={() => {
            setDetailUserId(null);
            setDetail(null);
          }}
          onRefresh={async () => {
            await loadDetail(detailUserId);
            await load();
          }}
          onIdentityReplaced={() => setIdentityRefresh((n) => n + 1)}
          pushToast={pushToast}
        />
      ) : null}
    </>
  );
}

function LegacyFreelancerDetailDrawer({
  detail,
  loading,
  detailTab,
  setDetailTab,
  identityRefresh,
  planOptions,
  docTypes,
  onClose,
  onRefresh,
  onIdentityReplaced,
  pushToast,
}) {
  const { t } = useTranslation();
  const detailTabs = useMemo(() => getDetailTabs(t), [t]);
  const [pkgPlanId, setPkgPlanId] = useState("");
  const [pkgDuration, setPkgDuration] = useState("3");
  const [pkgBusy, setPkgBusy] = useState(false);
  const [moneyAmount, setMoneyAmount] = useState("");
  const [moneyNote, setMoneyNote] = useState("");
  const [moneyBusy, setMoneyBusy] = useState(false);
  const [docBusyId, setDocBusyId] = useState(null);
  const [idBusySide, setIdBusySide] = useState(null);

  const activeSignedIds = useMemo(() => {
    const set = new Set();
    for (const d of detail?.signedDocuments || []) {
      if (d.isActive !== false) set.add(String(d.documentTypeId));
    }
    return set;
  }, [detail]);

  const assignPackage = async () => {
    if (!detail?.id || !pkgPlanId) return;
    setPkgBusy(true);
    try {
      await assignLegacyFreelancerPackageRequest(detail.id, {
        planId: Number(pkgPlanId),
        durationMonths: Number(pkgDuration),
      });
      pushToast({ type: "success", message: t("legacy.toast.assignPackageSuccess") });
      await onRefresh();
    } catch (err) {
      pushToast({ type: "error", message: getSafeApiErrorMessage(err, t("legacy.toast.assignPackageFailed")) });
    } finally {
      setPkgBusy(false);
    }
  };

  const addMoney = async (e) => {
    e.preventDefault();
    if (!detail?.id) return;
    setMoneyBusy(true);
    try {
      await addLegacyFreelancerHistoricalMoneyRequest(detail.id, {
        amount: Number(moneyAmount),
        note: moneyNote || undefined,
        currency: "JOD",
      });
      setMoneyAmount("");
      setMoneyNote("");
      pushToast({ type: "success", message: t("legacy.toast.historicalRecorded") });
      await onRefresh();
    } catch (err) {
      pushToast({ type: "error", message: getSafeApiErrorMessage(err, t("legacy.toast.historicalFailed")) });
    } finally {
      setMoneyBusy(false);
    }
  };

  const voidMoney = async (id) => {
    if (!detail?.id) return;
    const reason = window.prompt(t("legacy.common.voidReasonPrompt")) || undefined;
    try {
      await voidLegacyFreelancerHistoricalMoneyRequest(detail.id, id, { voidReason: reason });
      pushToast({ type: "success", message: t("legacy.toast.voidSuccess") });
      await onRefresh();
    } catch (err) {
      pushToast({ type: "error", message: getSafeApiErrorMessage(err, t("legacy.toast.voidFailed")) });
    }
  };

  const toggleSignedDoc = async (documentTypeId, currentlyActive) => {
    if (!detail?.id) return;
    setDocBusyId(documentTypeId);
    try {
      if (currentlyActive) {
        await removeLegacyFreelancerSignedDocumentRequest(detail.id, documentTypeId);
      } else {
        await setLegacyFreelancerSignedDocumentRequest(detail.id, { documentTypeId });
      }
      await onRefresh();
    } catch (err) {
      pushToast({ type: "error", message: getSafeApiErrorMessage(err, t("legacy.toast.docUpdateFailed")) });
    } finally {
      setDocBusyId(null);
    }
  };

  const replaceIdentity = async (side, file) => {
    if (!detail?.id || !file) return;
    setIdBusySide(side);
    try {
      await replaceLegacyFreelancerIdentityRequest(detail.id, side, file);
      pushToast({ type: "success", message: t("legacy.toast.identityReplaced") });
      onIdentityReplaced();
      await onRefresh();
    } catch (err) {
      pushToast({ type: "error", message: getSafeApiErrorMessage(err, t("legacy.toast.uploadFailed")) });
    } finally {
      setIdBusySide(null);
    }
  };

  const hasFront = (detail?.identityDocuments || []).some((d) => String(d.side).toUpperCase() === "FRONT");
  const hasBack = (detail?.identityDocuments || []).some((d) => String(d.side).toUpperCase() === "BACK");

  return (
    <div className="oh-sa-users-drawer" role="dialog" aria-modal="true" aria-labelledby="oh-legacy-drawer-title">
      <button type="button" className="oh-sa-users-drawer__backdrop" aria-label={t("legacy.common.close")} onClick={onClose} />
      <aside className="oh-sa-users-drawer__panel">
        <header className="oh-sa-users-drawer__header">
          <div>
            <h2 id="oh-legacy-drawer-title">{detail?.fullName || t("legacy.common.freelancerDetails")}</h2>
            <p className="oh-sa-users-drawer__sub">
              <span className="oh-legacy-admin__member-id">{detail?.freelancerMemberIdMasked || "—"}</span>
            </p>
          </div>
          <button type="button" className="oh-sa-users-drawer__close" onClick={onClose} aria-label={t("legacy.common.close")}>
            ×
          </button>
        </header>

        <nav className="oh-sa-users-tabs" role="tablist" aria-label={t("legacy.common.detailSections")}>
          {detailTabs.map((tab) => (
            <button
              key={tab.id}
              type="button"
              role="tab"
              aria-selected={detailTab === tab.id}
              className={`oh-sa-users-tabs__btn${detailTab === tab.id ? " is-active" : ""}`}
              onClick={() => setDetailTab(tab.id)}
            >
              {tab.label}
            </button>
          ))}
        </nav>

        <div className="oh-sa-users-drawer__body">
          {loading || !detail ? (
            <DashboardLoadingState />
          ) : detailTab === "profile" ? (
            <dl className="oh-sa-users-kv">
              <div>
                <span>{t("legacy.common.fullName")}</span>
                <strong>{detail.fullName}</strong>
              </div>
              <div>
                <span>{t("legacy.common.membershipId")}</span>
                <strong className="oh-legacy-admin__member-id">{detail.freelancerMemberIdMasked || "—"}</strong>
              </div>
              <div>
                <span>{t("legacy.common.email")}</span>
                <strong dir="ltr">{detail.email || "—"}</strong>
              </div>
              <div>
                <span>{t("legacy.common.phone")}</span>
                <strong dir="ltr">{detail.phone || "—"}</strong>
              </div>
              <div>
                <span>{t("legacy.join.workFieldSection")}</span>
                <strong>
                  {detail.workFields?.isEmpty || !(detail.workFields?.labels || []).length ? (
                    t("legacy.common.unspecified")
                  ) : (
                    <span className="oh-legacy-work-chips">
                      {detail.workFields.labels.map((lbl) => (
                        <span key={lbl} className="oh-legacy-work-chip">
                          {lbl}
                        </span>
                      ))}
                    </span>
                  )}
                </strong>
              </div>
              <div>
                <span>{t("legacy.common.skillsPrograms")}</span>
                <strong>
                  {!(detail.detailedSkills || []).length ? (
                    "—"
                  ) : (
                    <span className="oh-legacy-work-chips">
                      {(detail.detailedSkills || []).map((sk) => (
                        <span key={sk} className="oh-legacy-work-chip">
                          {sk}
                        </span>
                      ))}
                    </span>
                  )}
                </strong>
              </div>
              <div>
                <span>{t("legacy.common.entryMethod")}</span>
                <strong>
                  <StatusBadge
                    tone={detail.legacyEntryMethod === "ADMIN_MANUAL" ? "admin_assigned" : "neutral"}
                  >
                    {entryMethodLabel(detail.legacyEntryMethod, t)}
                  </StatusBadge>
                </strong>
              </div>
              <div>
                <span>{t("legacy.common.status")}</span>
                <strong>
                  <StatusBadge tone={detail.isActive ? "success" : "danger"}>
                    {detail.isActive ? t("legacy.common.active") : t("legacy.common.inactive")}
                  </StatusBadge>
                </strong>
              </div>
              <div>
                <span>{t("legacy.common.currentPackage")}</span>
                <strong>{detail.plan?.title || detail.plan?.name || "—"}</strong>
              </div>
              <div>
                <span>{t("legacy.common.packageExpiry")}</span>
                <strong>{formatDate(detail.plan?.expiresAt)}</strong>
              </div>
            </dl>
          ) : detailTab === "identity" ? (
            <div className="oh-sa-users-stack">
              {hasFront ? (
                <LegacyIdentityImage
                  userId={detail.id}
                  side="front"
                  label={t("legacy.common.idFrontFull")}
                  refreshKey={identityRefresh}
                />
              ) : (
                <p className="oh-sa-users-muted">{t("legacy.common.noFrontSaved")}</p>
              )}
              <label className="oh-sa-users-field">
                <span>{t("legacy.common.replaceFront")}</span>
                <input
                  type="file"
                  accept="image/*"
                  disabled={idBusySide === "front"}
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    e.target.value = "";
                    if (f) replaceIdentity("front", f);
                  }}
                />
              </label>
              {hasBack ? (
                <LegacyIdentityImage
                  userId={detail.id}
                  side="back"
                  label={t("legacy.common.idBackFull")}
                  refreshKey={identityRefresh}
                />
              ) : (
                <p className="oh-sa-users-muted">{t("legacy.common.noBackSaved")}</p>
              )}
              <label className="oh-sa-users-field">
                <span>{t("legacy.common.replaceBack")}</span>
                <input
                  type="file"
                  accept="image/*"
                  disabled={idBusySide === "back"}
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    e.target.value = "";
                    if (f) replaceIdentity("back", f);
                  }}
                />
              </label>
            </div>
          ) : detailTab === "docs" ? (
            <div className="oh-sa-users-stack">
              <p className="oh-sa-users-muted" style={{ margin: 0 }}>
                {t("legacy.common.docsSignedAdminNote")}
              </p>
              {docTypes.length === 0 ? (
                <DashboardEmptyState title={t("legacy.campaigns.noDocTypesDetail")} />
              ) : (
                docTypes.map((t) => {
                  const active = activeSignedIds.has(String(t.id));
                  return (
                    <label key={t.id} className="oh-legacy-admin__doc-card" style={{ cursor: "pointer" }}>
                      <div className="oh-legacy-admin__meta">
                        <strong>{t.labelAr}</strong>
                        <span>{active ? t("legacy.common.signedConfirmed") : t("legacy.common.unsigned")}</span>
                      </div>
                      <input
                        type="checkbox"
                        checked={active}
                        disabled={docBusyId === t.id}
                        onChange={() => toggleSignedDoc(t.id, active)}
                      />
                    </label>
                  );
                })
              )}
            </div>
          ) : detailTab === "package" ? (
            <div className="oh-sa-users-stack">
              <div className="oh-legacy-admin__notice oh-legacy-admin__notice--info">
                {t("legacy.common.currentPlanLine", { name: detail.plan?.title || detail.plan?.name || "—" })}
                <br />
                {t("legacy.common.expiryLine", { date: formatDate(detail.plan?.expiresAt) })}
              </div>
              <div className="oh-legacy-admin__form-grid">
                <label className="oh-sa-users-field">
                  <span>{t("legacy.common.newPackage")}</span>
                  <select value={pkgPlanId} onChange={(e) => setPkgPlanId(e.target.value)}>
                    <option value="">{t("legacy.common.select")}</option>
                    {planOptions.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.label}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="oh-sa-users-field">
                  <span>{t("legacy.common.durationMonths")}</span>
                  <select value={pkgDuration} onChange={(e) => setPkgDuration(e.target.value)}>
                    {PACKAGE_DURATION_OPTIONS.map((m) => (
                      <option key={m} value={m}>
                        {m}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
              <Button type="button" disabled={pkgBusy || !pkgPlanId} onClick={assignPackage}>
                {pkgBusy ? t("legacy.common.assigning") : t("legacy.common.assignPackageAction")}
              </Button>
              <h4 style={{ margin: "0.5rem 0 0", fontSize: "0.9rem" }}>{t("legacy.common.assignmentHistory")}</h4>
              {(detail.packageHistory || []).length === 0 ? (
                <p className="oh-sa-users-muted">{t("legacy.common.noHistoryYet")}</p>
              ) : (
                <ul className="oh-sa-users-stack" style={{ listStyle: "none", padding: 0, margin: 0 }}>
                  {(detail.packageHistory || []).map((h) => (
                    <li key={h.id} className="oh-legacy-admin__doc-card">
                      <div className="oh-legacy-admin__meta">
                        <strong>{h.planTitle || h.planName || h.planId}</strong>
                        <span>
                          {formatDate(h.startsAt)} → {formatDate(h.expiresAt)} · {h.durationMonths || "—"}{" "}
                          {t("legacy.common.months")} ·{" "}
                          {h.status}
                        </span>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          ) : (
            <div className="oh-sa-users-stack">
              <p className="oh-legacy-admin__notice">
                {t("legacy.common.historicalMoneyNotice")}
              </p>
              <p style={{ margin: 0 }}>
                {t("legacy.common.activeTotal")}:{" "}
                <strong>
                  {formatMoney(detail.historicalMoney?.total, detail.historicalMoney?.currency || "JOD")}
                </strong>
              </p>
              <form className="oh-legacy-admin__form-grid" onSubmit={addMoney}>
                <label className="oh-sa-users-field">
                  <span>{t("legacy.common.amount")}</span>
                  <input
                    required
                    type="number"
                    min={0.01}
                    step="0.01"
                    dir="ltr"
                    value={moneyAmount}
                    onChange={(e) => setMoneyAmount(e.target.value)}
                  />
                </label>
                <label className="oh-sa-users-field">
                  <span>{t("legacy.common.note")}</span>
                  <input value={moneyNote} onChange={(e) => setMoneyNote(e.target.value)} />
                </label>
                <div className="oh-sa-users-filters__actions">
                  <Button type="submit" disabled={moneyBusy}>
                    {t("legacy.common.add")}
                  </Button>
                </div>
              </form>
              <ul className="oh-sa-users-stack" style={{ listStyle: "none", padding: 0, margin: 0 }}>
                {(detail.historicalMoney?.records || []).map((r) => (
                  <li
                    key={r.id}
                    className="oh-legacy-admin__doc-card"
                    style={r.isVoided ? { opacity: 0.55, textDecoration: "line-through" } : undefined}
                  >
                    <div className="oh-legacy-admin__meta">
                      <strong>{formatMoney(r.amount, r.currency)}</strong>
                      <span>
                        {r.note || "—"} · {formatDate(r.receivedAt || r.createdAt)}
                      </span>
                    </div>
                    {!r.isVoided ? (
                      <Button type="button" variant="secondary" onClick={() => voidMoney(r.id)}>
                        {t("legacy.common.cancel")}
                      </Button>
                    ) : (
                      <span className="oh-sa-users-muted">{t("legacy.common.voided")}</span>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      </aside>
    </div>
  );
}
