import { useCallback, useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import Button from "../../components/ui/Button";
import DashboardSection from "../../components/dashboard/DashboardSection";
import DashboardEmptyState from "../../components/dashboard/DashboardEmptyState";
import DashboardLoadingState from "../../components/dashboard/DashboardLoadingState";
import DashboardErrorState from "../../components/dashboard/DashboardErrorState";
import { useToast } from "../../components/ui/toastContext";
import {
  createMarketplaceArticleRequest,
  getCategoriesRequest,
  getSubcategoriesRequest,
  listAdminMarketplaceArticlesRequest,
  updateMarketplaceArticleRequest,
  listSuperAdminActivationCampaignsRequest,
} from "../../services/api";
import { getSafeApiErrorMessage } from "../../utils/apiErrorMessage";
import MarketplaceArticleCard from "../../admin/marketplaceArticles/MarketplaceArticleCard";
import MarketplaceArticleFormModal from "../../admin/marketplaceArticles/MarketplaceArticleFormModal";
import MarketplaceArticleApplicationsPanel from "../../admin/marketplaceArticles/MarketplaceArticleApplicationsPanel";
import "../../admin/marketplaceMembership/marketplace-membership-plans.css";

/**
 * Super Admin articles list/create/edit — reused inside إدارة المقالات hub.
 * Arabic-first labels (platform SA UX).
 */
export default function MarketplaceArticlesAdminPanel({ showHeaderActions = true }) {
  const { push } = useToast();
  const [searchParams, setSearchParams] = useSearchParams();

  const [articles, setArticles] = useState([]);
  const [categories, setCategories] = useState([]);
  const [subcategories, setSubcategories] = useState([]);
  const [activationCampaigns, setActivationCampaigns] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [editArticle, setEditArticle] = useState(null);

  const refresh = useCallback(async () => {
    setError("");
    setLoading(true);
    try {
      const [articlesRes, catsRes, campaignsRes] = await Promise.all([
        listAdminMarketplaceArticlesRequest({}),
        getCategoriesRequest(),
        listSuperAdminActivationCampaignsRequest().catch(() => null),
      ]);
      setArticles(Array.isArray(articlesRes?.data?.articles) ? articlesRes.data.articles : []);
      const cats = catsRes?.data?.categories || catsRes?.data || catsRes?.categories || [];
      setCategories(Array.isArray(cats) ? cats : []);
      const campaignList = campaignsRes?.data?.campaigns || campaignsRes?.campaigns || [];
      setActivationCampaigns(Array.isArray(campaignList) ? campaignList : []);
    } catch (err) {
      setError(getSafeApiErrorMessage(err) || "تعذر تحميل المقالات.");
      setArticles([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

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
      setCreateOpen(false);
      push({ type: "success", message: "تم إنشاء المقال." });
      await refresh();
    } catch (err) {
      push({
        type: "error",
        message: getSafeApiErrorMessage(err) || "فشل الإنشاء.",
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
      push({ type: "success", message: "تم تحديث المقال." });
      await refresh();
    } catch (err) {
      push({
        type: "error",
        message: getSafeApiErrorMessage(err) || "فشل التحديث.",
      });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div data-testid="marketplace-articles-admin-panel">
      <DashboardSection>
        <div className="flex flex-wrap items-start justify-between gap-3 mb-3">
          <p style={{ marginTop: 0, opacity: 0.9, maxWidth: "40rem" }}>
            أنشئ وعدّل مقالات العمل، وربطها بحملات التفعيل عند الحاجة.
          </p>
          {showHeaderActions ? (
            <Button type="button" onClick={() => setCreateOpen(true)} data-testid="articles-add-btn">
              إضافة مقال
            </Button>
          ) : null}
        </div>

        {loading ? <DashboardLoadingState /> : null}
        {!loading && error ? <DashboardErrorState message={error} onRetry={refresh} /> : null}
        {!loading && !error && articles.length === 0 ? (
          <DashboardEmptyState title="لا توجد مقالات بعد" description="أنشئ أول مقال" />
        ) : null}
        {!loading && !error && articles.length > 0 ? (
          <div className="oh-mmp-grid">
            {articles.map((article) => (
              <MarketplaceArticleCard
                key={article.id}
                article={article}
                isEn={false}
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

      <MarketplaceArticleFormModal
        open={createOpen}
        mode="create"
        categories={categories}
        subcategories={subcategories}
        activationCampaigns={activationCampaigns}
        isEn={false}
        submitting={submitting}
        onClose={() => setCreateOpen(false)}
        onSubmit={handleCreate}
        onCategoryChange={loadSubcategories}
      />

      <MarketplaceArticleFormModal
        open={Boolean(editArticle)}
        mode="edit"
        initialArticle={editArticle}
        categories={categories}
        subcategories={subcategories}
        activationCampaigns={activationCampaigns}
        isEn={false}
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
            isEn={false}
            onToast={push}
            onRelisted={refresh}
          />
        </DashboardSection>
      ) : null}
    </div>
  );
}
