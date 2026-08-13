import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import Button from "../../components/ui/Button";
import DashboardPageHeader from "../../components/dashboard/DashboardPageHeader";
import DashboardShell from "../../components/dashboard/DashboardShell";
import DashboardSection from "../../components/dashboard/DashboardSection";
import DashboardEmptyState from "../../components/dashboard/DashboardEmptyState";
import DashboardLoadingState from "../../components/dashboard/DashboardLoadingState";
import DashboardErrorState from "../../components/dashboard/DashboardErrorState";
import { superAdminBreadcrumbs } from "../../components/dashboard/dashboardBreadcrumbs";
import { useTranslation } from "../../i18n/LanguageProvider";
import { useToast } from "../../components/ui/toastContext";
import {
  createMarketplaceArticleRequest,
  getCategoriesRequest,
  getSubcategoriesRequest,
  listAdminMarketplaceArticlesRequest,
  updateMarketplaceArticleRequest,
} from "../../services/api";
import { getSafeApiErrorMessage } from "../../utils/apiErrorMessage";
import MarketplaceArticleCard from "../../admin/marketplaceArticles/MarketplaceArticleCard";
import MarketplaceArticleFormModal from "../../admin/marketplaceArticles/MarketplaceArticleFormModal";
import MarketplaceArticleApplicationsPanel from "../../admin/marketplaceArticles/MarketplaceArticleApplicationsPanel";
import "../../admin/marketplaceMembership/marketplace-membership-plans.css";

export default function SuperAdminMarketplaceArticlesPage() {
  const { locale } = useTranslation();
  const isEn = locale === "en";
  const { push } = useToast();

  const [articles, setArticles] = useState([]);
  const [categories, setCategories] = useState([]);
  const [subcategories, setSubcategories] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [editArticle, setEditArticle] = useState(null);

  const refresh = useCallback(async () => {
    setError("");
    setLoading(true);
    try {
      const [articlesRes, catsRes] = await Promise.all([
        listAdminMarketplaceArticlesRequest({}),
        getCategoriesRequest(),
      ]);
      setArticles(Array.isArray(articlesRes?.data?.articles) ? articlesRes.data.articles : []);
      const cats = catsRes?.data?.categories || catsRes?.data || catsRes?.categories || [];
      setCategories(Array.isArray(cats) ? cats : []);
    } catch (err) {
      setError(getSafeApiErrorMessage(err) || (isEn ? "Failed to load articles." : "تعذر تحميل المقالات."));
      setArticles([]);
    } finally {
      setLoading(false);
    }
  }, [isEn]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

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
      push({ type: "success", message: isEn ? "Article created." : "تم إنشاء المقال." });
      await refresh();
    } catch (err) {
      push({
        type: "error",
        message: getSafeApiErrorMessage(err) || (isEn ? "Create failed." : "فشل الإنشاء."),
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
      push({ type: "success", message: isEn ? "Article updated." : "تم تحديث المقال." });
      await refresh();
    } catch (err) {
      push({
        type: "error",
        message: getSafeApiErrorMessage(err) || (isEn ? "Update failed." : "فشل التحديث."),
      });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <DashboardShell>
      <DashboardPageHeader
        title={isEn ? "Marketplace Articles" : "مقالات العمل (Marketplace)"}
        breadcrumbs={superAdminBreadcrumbs(["dashboard.breadcrumbs.marketplaceArticles"])}
        actions={
          <Button type="button" onClick={() => setCreateOpen(true)}>
            {isEn ? "Add Article" : "إضافة مقال"}
          </Button>
        }
      />

      <DashboardSection>
        <p style={{ marginTop: 0, opacity: 0.85 }}>
          {isEn
            ? "Marketplace Articles with level/value model. Applications use membership access levels; Bid cost still pending owner approval."
            : "مقالات Marketplace بنموذج المستوى/القيمة. التقديم يعتمد على مستوى وصول العضوية؛ تكلفة العروض بانتظار موافقة المالك."}
        </p>
        <p style={{ fontSize: "0.9rem" }}>
          <Link to="/dashboard/super-admin/marketplace-plans">
            {isEn ? "Work membership plans" : "باقات العمل"}
          </Link>
        </p>

        {loading ? <DashboardLoadingState /> : null}
        {!loading && error ? <DashboardErrorState message={error} onRetry={refresh} /> : null}
        {!loading && !error && articles.length === 0 ? (
          <DashboardEmptyState
            title={isEn ? "No Articles yet" : "لا توجد مقالات بعد"}
            description={isEn ? "Create the first Marketplace Article." : "أنشئ أول مقال Marketplace."}
          />
        ) : null}
        {!loading && !error && articles.length > 0 ? (
          <div className="oh-mmp-grid">
            {articles.map((article) => (
              <MarketplaceArticleCard
                key={article.id}
                article={article}
                isEn={isEn}
                busy={submitting}
                onEdit={async (a) => {
                  setEditArticle(a);
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
        isEn={isEn}
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
        isEn={isEn}
        submitting={submitting}
        onClose={() => setEditArticle(null)}
        onSubmit={handleUpdate}
        onCategoryChange={loadSubcategories}
      />

      {editArticle?.id ? (
        <DashboardSection>
          <MarketplaceArticleApplicationsPanel
            articleId={editArticle.id}
            isEn={isEn}
            onToast={push}
          />
        </DashboardSection>
      ) : null}
    </DashboardShell>
  );
}
