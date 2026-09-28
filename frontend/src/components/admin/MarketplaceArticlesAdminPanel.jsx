import { useCallback, useEffect, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { useArticlesT } from "../../admin/marketplaceArticles/useArticlesT";
import Button from "../../components/ui/Button";
import DashboardSection from "../../components/dashboard/DashboardSection";
import DashboardEmptyState from "../../components/dashboard/DashboardEmptyState";
import DashboardLoadingState from "../../components/dashboard/DashboardLoadingState";
import DashboardErrorState from "../../components/dashboard/DashboardErrorState";
import { useToast } from "../../components/ui/toastContext";
import { useAuth } from "../../context/useAuth";
import { isSuperAdminUser } from "../../constants/dashboardPermissions";
import {
  createMarketplaceArticleRequest,
  getCategoriesRequest,
  getSubcategoriesRequest,
  listAdminMarketplaceArticlesRequest,
  updateMarketplaceArticleRequest,
  listSuperAdminActivationCampaignsRequest,
  listAdminBildazoCategoriesRequest,
  listAdminArticlePackageRequirementsRequest,
  updateAdminArticlePackageRequirementsRequest,
} from "../../services/api";
import { getSafeApiErrorMessage } from "../../utils/apiErrorMessage";
import MarketplaceArticleCard from "../../admin/marketplaceArticles/MarketplaceArticleCard";
import MarketplaceArticleFormModal from "../../admin/marketplaceArticles/MarketplaceArticleFormModal";
import MarketplaceArticleApplicationsPanel from "../../admin/marketplaceArticles/MarketplaceArticleApplicationsPanel";
import {
  ARTICLE_PACKAGE_PLAN_CODES,
  defaultPackageRequirementsState,
} from "../../admin/marketplaceArticles/marketplaceArticleFormUtils";
import { useAdminListLoad } from "../../hooks/useAdminListLoad";
import "../../admin/marketplaceMembership/marketplace-membership-plans.css";

/**
 * Super Admin articles list/create/edit — reused inside إدارة المقالات hub.
 * Arabic-first labels (platform SA UX).
 *
 * @param {object} props
 * @param {boolean} [props.showHeaderActions=true]
 * @param {boolean} [props.inventoryHub=false] — always-visible OZ02 create + package reqs for مخزون المقالات
 */
export default function MarketplaceArticlesAdminPanel({
  showHeaderActions = true,
  inventoryHub = false,
}) {
  const { t } = useArticlesT();
  const { push } = useToast();
  const { user } = useAuth();
  const canEditPackageRequirements = isSuperAdminUser(user);
  const [searchParams, setSearchParams] = useSearchParams();

  const [articles, setArticles] = useState([]);
  const [categories, setCategories] = useState([]);
  const [subcategories, setSubcategories] = useState([]);
  const [activationCampaigns, setActivationCampaigns] = useState([]);
  const [bildazoCategories, setBildazoCategories] = useState([]);
  const [bildazoCategoriesLoading, setBildazoCategoriesLoading] = useState(false);
  const [bildazoCategoriesError, setBildazoCategoriesError] = useState("");
  const [packageRequirements, setPackageRequirements] = useState(defaultPackageRequirementsState);
  const [packageReqsLoading, setPackageReqsLoading] = useState(false);
  const [packageReqsSaving, setPackageReqsSaving] = useState(false);
  const articlesLenRef = useRef(0);
  articlesLenRef.current = articles.length;
  const {
    initialLoading,
    refreshing,
    initialLoadError,
    refreshError,
    rateLimited,
    run: runListLoad,
  } = useAdminListLoad({
    mapError: (err) => getSafeApiErrorMessage(err) || t("adminPanel.loadError"),
  });
  const [submitting, setSubmitting] = useState(false);
  const [createOpen, setCreateOpen] = useState(Boolean(inventoryHub));
  const [editArticle, setEditArticle] = useState(null);

  const formOpen = createOpen || Boolean(editArticle);

  const refresh = useCallback(async () => {
    const result = await runListLoad(
      async ({ signal }) => {
        const [articlesRes, catsRes, campaignsRes] = await Promise.all([
          listAdminMarketplaceArticlesRequest({}, { signal }),
          getCategoriesRequest(),
          listSuperAdminActivationCampaignsRequest().catch(() => null),
        ]);
        return { articlesRes, catsRes, campaignsRes };
      },
      { hasExistingRows: articlesLenRef.current > 0 },
    );
    if (!result.ok) return;
    const { articlesRes, catsRes, campaignsRes } = result.data;
    setArticles(Array.isArray(articlesRes?.data?.articles) ? articlesRes.data.articles : []);
    const cats = catsRes?.data?.categories || catsRes?.data || catsRes?.categories || [];
    setCategories(Array.isArray(cats) ? cats : []);
    const campaignList = campaignsRes?.data?.campaigns || campaignsRes?.campaigns || [];
    setActivationCampaigns(Array.isArray(campaignList) ? campaignList : []);
  }, [runListLoad]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const loadPackageRequirements = useCallback(async () => {
    setPackageReqsLoading(true);
    try {
      const res = await listAdminArticlePackageRequirementsRequest();
      const items = res?.data?.requirements;
      if (Array.isArray(items) && items.length) {
        const byCode = Object.fromEntries(items.map((r) => [String(r.planCode).toUpperCase(), r]));
        setPackageRequirements(
          ARTICLE_PACKAGE_PLAN_CODES.map((planCode) => ({
            planCode,
            minWords: Number(byCode[planCode]?.minWords) || defaultPackageRequirementsState().find((d) => d.planCode === planCode).minWords,
            minReferences:
              Number(byCode[planCode]?.minReferences) ??
              defaultPackageRequirementsState().find((d) => d.planCode === planCode).minReferences,
          })),
        );
      } else {
        setPackageRequirements(defaultPackageRequirementsState());
      }
    } catch {
      setPackageRequirements(defaultPackageRequirementsState());
    } finally {
      setPackageReqsLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadPackageRequirements();
  }, [loadPackageRequirements]);

  const loadBildazoCategories = useCallback(async () => {
    setBildazoCategoriesLoading(true);
    setBildazoCategoriesError("");
    try {
      const res = await listAdminBildazoCategoriesRequest();
      const items = res?.data?.categories;
      setBildazoCategories(Array.isArray(items) ? items : []);
    } catch (err) {
      setBildazoCategories([]);
      setBildazoCategoriesError(
        getSafeApiErrorMessage(err) || t("form.bildazoLoadError"),
      );
    } finally {
      setBildazoCategoriesLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadBildazoCategories();
  }, [loadBildazoCategories]);

  useEffect(() => {
    if (!formOpen) return;
    if (bildazoCategories.length || bildazoCategoriesLoading || bildazoCategoriesError) return;
    void loadBildazoCategories();
  }, [
    formOpen,
    loadBildazoCategories,
    bildazoCategories.length,
    bildazoCategoriesLoading,
    bildazoCategoriesError,
  ]);

  useEffect(() => {
    const editId = searchParams.get("edit");
    if (!editId || !articles.length) return;
    const found = articles.find((a) => String(a.id) === String(editId));
    if (found) {
      setEditArticle(found);
      void loadSubcategories(found.categoryId || found.category?.id);
    }
  }, [searchParams, articles]);

  const loadSubcategories = async (categoryId) => {
    if (!categoryId) {
      setSubcategories([]);
      return;
    }
    try {
      const res = await getSubcategoriesRequest(categoryId);
      const items = res?.data?.subcategories || res?.data || res?.subcategories || [];
      setSubcategories(Array.isArray(items) ? items : []);
    } catch {
      setSubcategories([]);
    }
  };

  const handleCreate = async (payload) => {
    setSubmitting(true);
    try {
      await createMarketplaceArticleRequest(payload);
      if (!inventoryHub) setCreateOpen(false);
      push({ type: "success", message: t("adminPanel.createSuccess") });
      await refresh();
    } catch (err) {
      push({
        type: "error",
        message: getSafeApiErrorMessage(err) || t("adminPanel.createError"),
      });
    } finally {
      setSubmitting(false);
    }
  };

  const handleUpdate = async (payload) => {
    if (!editArticle?.id) return;
    setSubmitting(true);
    try {
      await updateMarketplaceArticleRequest(editArticle.id, payload);
      setEditArticle(null);
      const next = new URLSearchParams(searchParams);
      next.delete("edit");
      setSearchParams(next, { replace: true });
      push({ type: "success", message: t("adminPanel.updateSuccess") });
      await refresh();
    } catch (err) {
      push({
        type: "error",
        message: getSafeApiErrorMessage(err) || t("adminPanel.updateError"),
      });
    } finally {
      setSubmitting(false);
    }
  };

  const setPackageField = (planCode, key, value) => {
    setPackageRequirements((prev) =>
      prev.map((row) => (row.planCode === planCode ? { ...row, [key]: value } : row)),
    );
  };

  const handleSavePackageRequirements = async () => {
    if (!canEditPackageRequirements || packageReqsSaving) return;
    setPackageReqsSaving(true);
    try {
      const res = await updateAdminArticlePackageRequirementsRequest({
        requirements: packageRequirements.map((r) => ({
          planCode: r.planCode,
          minWords: Number(r.minWords),
          minReferences: Number(r.minReferences),
        })),
      });
      const items = res?.data?.requirements;
      if (Array.isArray(items) && items.length) {
        setPackageRequirements(
          ARTICLE_PACKAGE_PLAN_CODES.map((planCode) => {
            const found = items.find((i) => String(i.planCode).toUpperCase() === planCode);
            return {
              planCode,
              minWords: Number(found?.minWords) || 0,
              minReferences: Number(found?.minReferences) || 0,
            };
          }),
        );
      }
      push({ type: "success", message: t("adminPanel.packageSaveSuccess") });
    } catch (err) {
      push({
        type: "error",
        message: getSafeApiErrorMessage(err) || t("adminPanel.packageSaveError"),
      });
    } finally {
      setPackageReqsSaving(false);
    }
  };

  return (
    <div data-testid="marketplace-articles-admin-panel">
      <DashboardSection>
        {inventoryHub ? (
          <div className="oh-mmp-inventory-hub-banner" style={{ marginBottom: 12 }} data-testid="inventory-add-section">
            <h3 className="oh-articles-hub__section-title" style={{ marginTop: 0 }}>
              {t("adminPanel.inventoryAddTitle")}
            </h3>
          </div>
        ) : (
          <div className="flex flex-wrap items-start justify-between gap-3 mb-3">
            <p style={{ marginTop: 0, opacity: 0.9, maxWidth: "40rem" }}>
              {t("adminPanel.intro")}
            </p>
            {showHeaderActions ? (
              <div className="flex flex-wrap items-center gap-2">
                {refreshing ? (
                  <span className="text-sm text-slate-500" data-testid="admin-list-refreshing">
                    {t("adminPanel.refreshing")}
                  </span>
                ) : null}
                <Button
                  type="button"
                  variant="secondary"
                  onClick={() => void refresh()}
                  disabled={refreshing || rateLimited}
                  data-testid="articles-refresh-btn"
                >
                  {t("common.refresh")}
                </Button>
                <Button type="button" onClick={() => setCreateOpen(true)} data-testid="articles-add-btn">
                  {t("adminPanel.addArticle")}
                </Button>
              </div>
            ) : null}
          </div>
        )}

        {inventoryHub ? (
          <MarketplaceArticleFormModal
            open={createOpen}
            mode="create"
            variant="inline"
            categories={categories}
            subcategories={subcategories}
            bildazoCategories={bildazoCategories}
            categoriesLoading={bildazoCategoriesLoading}
            categoriesError={bildazoCategoriesError}
            activationCampaigns={activationCampaigns}
            packageRequirements={packageRequirements}
            inventorySimplified
            submitting={submitting}
            titleOverride={t("adminPanel.inventoryAddTitle")}
            submitLabel={t("adminPanel.saveToInventory")}
            hideCancel
            onClose={() => {}}
            onSubmit={handleCreate}
            onCategoryChange={loadSubcategories}
          />
        ) : null}

        <details
          className="oh-mmp-package-reqs"
          data-testid="package-requirements-section"
          open={false}
        >
          <summary>{t("adminPanel.packageReqsTitle")}</summary>
          <p className="oh-mmp-form__hint" data-testid="package-requirements-auto-hint">
            {t("adminPanel.packageReqsHint")}
          </p>
          {packageReqsLoading ? (
            <p className="oh-mmp-form__hint">{t("adminPanel.packageLoading")}</p>
          ) : (
            <div className="oh-mmp-package-reqs__grid">
              {packageRequirements.map((row) => (
                <div key={row.planCode} className="oh-mmp-package-reqs__row">
                  <div className="oh-mmp-package-reqs__plan">
                    {row.planCode}
                    {t(`planLabels.${row.planCode}`)
                      ? ` / ${t(`planLabels.${row.planCode}`)}`
                      : ""}
                    <span className="oh-mmp-form__hint" style={{ display: "block", fontWeight: 400 }}>
                      {t("adminPanel.wordsRefsSummary", {
                        words: row.minWords,
                        references: row.minReferences,
                      })}
                    </span>
                  </div>
                  <label>
                    {t("adminPanel.minWords")}
                    <input
                      type="number"
                      min="1"
                      step="1"
                      value={row.minWords}
                      disabled={!canEditPackageRequirements || packageReqsSaving}
                      onChange={(e) => setPackageField(row.planCode, "minWords", e.target.value)}
                      data-testid={`package-req-words-${row.planCode}`}
                    />
                  </label>
                  <label>
                    {t("adminPanel.minReferences")}
                    <input
                      type="number"
                      min="0"
                      step="1"
                      value={row.minReferences}
                      disabled={!canEditPackageRequirements || packageReqsSaving}
                      onChange={(e) => setPackageField(row.planCode, "minReferences", e.target.value)}
                      data-testid={`package-req-refs-${row.planCode}`}
                    />
                  </label>
                </div>
              ))}
              {canEditPackageRequirements ? (
                <div>
                  <Button
                    type="button"
                    disabled={packageReqsSaving}
                    onClick={() => void handleSavePackageRequirements()}
                    data-testid="package-requirements-save"
                  >
                    {packageReqsSaving ? t("common.saving") : t("adminPanel.savePackageReqs")}
                  </Button>
                </div>
              ) : (
                <p className="oh-mmp-form__hint" style={{ margin: 0 }}>
                  {t("adminPanel.packageReadOnly")}
                </p>
              )}
            </div>
          )}
        </details>

        {inventoryHub && showHeaderActions ? (
          <div className="flex flex-wrap items-center gap-2" style={{ margin: "12px 0" }}>
            <h3 className="oh-articles-hub__section-title" style={{ margin: 0, flex: "1 1 auto" }}>
              {t("adminPanel.inventoryListTitle")}
            </h3>
            <Button
              type="button"
              variant="secondary"
              onClick={() => void refresh()}
              disabled={refreshing || rateLimited}
              data-testid="articles-refresh-btn"
            >
              {t("common.refreshList")}
            </Button>
          </div>
        ) : null}

        {refreshError ? (
          <p role="status" data-testid="admin-list-refresh-soft-note" className="mb-3 text-sm text-amber-700">
            {refreshError}
          </p>
        ) : null}

        {initialLoading && articles.length === 0 ? <DashboardLoadingState /> : null}
        {initialLoadError && articles.length === 0 ? (
          <DashboardErrorState message={initialLoadError} onRetry={refresh} />
        ) : null}
        {!initialLoading && !initialLoadError && articles.length === 0 ? (
          <DashboardEmptyState
            title={t("adminPanel.emptyTitle")}
            description={t("adminPanel.emptyDescription")}
          />
        ) : null}
        {articles.length > 0 ? (
          <div className="oh-mmp-grid" data-testid="admin-articles-list">
            {articles.map((article) => (
              <MarketplaceArticleCard
                key={article.id}
                article={article}
                busy={submitting}
                activationCampaigns={activationCampaigns}
                onEdit={async (a) => {
                  setEditArticle(a);
                  const next = new URLSearchParams(searchParams);
                  next.set("edit", String(a.id));
                  setSearchParams(next, { replace: true });
                  await loadSubcategories(a.categoryId || a.category?.id);
                }}
              />
            ))}
          </div>
        ) : null}
      </DashboardSection>

      {!inventoryHub ? (
        <MarketplaceArticleFormModal
          open={createOpen}
          mode="create"
          categories={categories}
          subcategories={subcategories}
          bildazoCategories={bildazoCategories}
          categoriesLoading={bildazoCategoriesLoading}
          categoriesError={bildazoCategoriesError}
          activationCampaigns={activationCampaigns}
          packageRequirements={packageRequirements}
          submitting={submitting}
          onClose={() => setCreateOpen(false)}
          onSubmit={handleCreate}
          onCategoryChange={loadSubcategories}
        />
      ) : null}

      <MarketplaceArticleFormModal
        open={Boolean(editArticle)}
        mode="edit"
        initialArticle={editArticle}
        categories={categories}
        subcategories={subcategories}
        bildazoCategories={bildazoCategories}
        categoriesLoading={bildazoCategoriesLoading}
        categoriesError={bildazoCategoriesError}
        activationCampaigns={activationCampaigns}
        packageRequirements={packageRequirements}
        submitting={submitting}
        onClose={() => {
          setEditArticle(null);
          const next = new URLSearchParams(searchParams);
          next.delete("edit");
          setSearchParams(next, { replace: true });
        }}
        onSubmit={handleUpdate}
        onCategoryChange={loadSubcategories}
      />

      {editArticle?.id ? (
        <DashboardSection>
          <MarketplaceArticleApplicationsPanel
            articleId={editArticle.id}
            onToast={push}
            onRelisted={refresh}
          />
        </DashboardSection>
      ) : null}
    </div>
  );
}
