import { useCallback, useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import Button from "../../components/ui/Button";
import DashboardPageHeader from "../../components/dashboard/DashboardPageHeader";
import DashboardShell from "../../components/dashboard/DashboardShell";
import DashboardSection from "../../components/dashboard/DashboardSection";
import DashboardEmptyState from "../../components/dashboard/DashboardEmptyState";
import DashboardLoadingState from "../../components/dashboard/DashboardLoadingState";
import DashboardErrorState from "../../components/dashboard/DashboardErrorState";
import { editWebsiteBreadcrumbs } from "../../components/dashboard/dashboardBreadcrumbs";
import { EDIT_WEBSITE_BASE } from "../../constants/superAdminWebsiteSections";
import { BLOCK_TYPE_LABELS, HOW_IT_WORKS_SLUG_TO_PAGE } from "../../constants/howItWorksPages";
import {
  createSuperAdminWebsitePageBlockRequest,
  deleteSuperAdminWebsitePageBlockRequest,
  getSuperAdminWebsitePageRequest,
  reorderSuperAdminWebsitePageBlocksRequest,
  updateSuperAdminWebsitePageBlockRequest,
  updateSuperAdminWebsitePageRequest,
} from "../../services/api";
import WebsiteContentImagePicker from "./WebsiteContentImagePicker";
import "./superAdminEditWebsitePage.css";

const BLOCK_TYPES = ["title", "text", "image", "text_image"];

function errorMessage(err) {
  return err?.response?.data?.message || "تعذر تنفيذ العملية. حاول مجدداً.";
}

function blockSummary(block) {
  if (block.blockType === "image") return block.title || block.imageUrl || "صورة";
  if (block.title) return block.title;
  if (block.body) return block.body.slice(0, 80);
  return BLOCK_TYPE_LABELS[block.blockType] || "محتوى";
}

function BlockFormModal({ mode, open, initial, onClose, onSaved, slug }) {
  const isEdit = mode === "edit";
  const [blockType, setBlockType] = useState("text");
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [imageUrl, setImageUrl] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!open) return;
    setBlockType(initial?.blockType || "text");
    setTitle(initial?.title || "");
    setBody(initial?.body || "");
    setImageUrl(initial?.imageUrl || "");
    setError("");
  }, [open, initial]);

  if (!open) return null;

  const needsTitle = blockType === "title" || blockType === "text" || blockType === "text_image";
  const needsBody = blockType === "title" || blockType === "text" || blockType === "text_image";
  const needsImage = blockType === "image" || blockType === "text_image";

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");
    const payload = {
      blockType,
      title: title.trim() || null,
      body: body.trim() || null,
      imageUrl: imageUrl.trim() || null,
    };

    if (blockType === "title" && !payload.title) {
      setError("أدخل عنوانًا للكتلة.");
      return;
    }
    if (blockType === "text" && !payload.title && !payload.body) {
      setError("أدخل عنوانًا أو نصًا.");
      return;
    }
    if (blockType === "image" && !payload.imageUrl) {
      setError("أضف صورة أو رابطًا.");
      return;
    }
    if (blockType === "text_image" && !payload.title && !payload.body && !payload.imageUrl) {
      setError("أضف عنوانًا أو نصًا أو صورة.");
      return;
    }

    setSubmitting(true);
    try {
      if (isEdit) {
        await updateSuperAdminWebsitePageBlockRequest(slug, initial.id, payload);
      } else {
        await createSuperAdminWebsitePageBlockRequest(slug, payload);
      }
      onSaved();
      onClose();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="oh-website-faq-modal" role="dialog" aria-modal="true">
      <button type="button" className="oh-website-faq-modal__backdrop" aria-label="إغلاق" onClick={onClose} />
      <div className="oh-website-faq-modal__panel oh-website-faq-modal__panel--wide">
        <div className="oh-website-faq-modal__header">
          <h2>{isEdit ? "تعديل محتوى" : "إضافة محتوى"}</h2>
          <button type="button" className="oh-website-faq-modal__close" aria-label="إغلاق" onClick={onClose}>
            ×
          </button>
        </div>
        <form className="oh-website-faq-form" onSubmit={handleSubmit}>
          <label>
            نوع المحتوى
            <select value={blockType} onChange={(e) => setBlockType(e.target.value)} disabled={submitting || isEdit}>
              {BLOCK_TYPES.map((type) => (
                <option key={type} value={type}>
                  {BLOCK_TYPE_LABELS[type]}
                </option>
              ))}
            </select>
          </label>
          {needsTitle ? (
            <label>
              العنوان
              <input type="text" value={title} onChange={(e) => setTitle(e.target.value)} disabled={submitting} />
            </label>
          ) : null}
          {needsBody ? (
            <label>
              النص
              <textarea value={body} onChange={(e) => setBody(e.target.value)} disabled={submitting} rows={5} />
            </label>
          ) : null}
          {needsImage ? (
            <div className="oh-website-faq-form__field">
              <span className="oh-website-faq-form__field-label">الصورة</span>
              <WebsiteContentImagePicker value={imageUrl} onChange={setImageUrl} disabled={submitting} />
            </div>
          ) : null}
          {error ? <p className="oh-website-faq-form__error">{error}</p> : null}
          <div className="oh-website-faq-form__actions">
            <Button type="button" variant="secondary" onClick={onClose} disabled={submitting}>
              إلغاء
            </Button>
            <Button type="submit" disabled={submitting}>
              {submitting ? "جاري الحفظ…" : isEdit ? "حفظ التعديل" : "إضافة"}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}

export default function SuperAdminEditWebsiteHowItWorksEditorPage() {
  const { slug = "" } = useParams();
  const pageMeta = HOW_IT_WORKS_SLUG_TO_PAGE[slug];
  const [page, setPage] = useState(null);
  const [blocks, setBlocks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [busyId, setBusyId] = useState(null);
  const [pageTitle, setPageTitle] = useState("");
  const [savingTitle, setSavingTitle] = useState(false);
  const [modal, setModal] = useState({ open: false, mode: "create", item: null });

  const loadPage = useCallback(async () => {
    if (!slug) return;
    setLoading(true);
    setError("");
    try {
      const res = await getSuperAdminWebsitePageRequest(slug);
      setPage(res?.data?.page || null);
      setBlocks(Array.isArray(res?.data?.blocks) ? res.data.blocks : []);
      setPageTitle(res?.data?.page?.title || "");
    } catch (err) {
      setError(errorMessage(err));
      setPage(null);
      setBlocks([]);
    } finally {
      setLoading(false);
    }
  }, [slug]);

  useEffect(() => {
    loadPage();
  }, [loadPage]);

  const savePageTitle = async () => {
    const nextTitle = pageTitle.trim();
    if (!nextTitle) {
      window.alert("أدخل عنوان الصفحة.");
      return;
    }
    setSavingTitle(true);
    try {
      await updateSuperAdminWebsitePageRequest(slug, { title: nextTitle });
      await loadPage();
    } catch (err) {
      window.alert(errorMessage(err));
    } finally {
      setSavingTitle(false);
    }
  };

  const handleDelete = async (block) => {
    if (!window.confirm(`حذف: «${blockSummary(block).slice(0, 48)}»؟`)) return;
    setBusyId(block.id);
    try {
      await deleteSuperAdminWebsitePageBlockRequest(slug, block.id);
      await loadPage();
    } catch (err) {
      window.alert(errorMessage(err));
    } finally {
      setBusyId(null);
    }
  };

  const moveBlock = async (index, direction) => {
    const targetIndex = index + direction;
    if (targetIndex < 0 || targetIndex >= blocks.length) return;
    const next = [...blocks];
    const [removed] = next.splice(index, 1);
    next.splice(targetIndex, 0, removed);
    setBusyId(removed.id);
    try {
      const res = await reorderSuperAdminWebsitePageBlocksRequest(
        slug,
        next.map((x) => x.id),
      );
      setBlocks(Array.isArray(res?.data?.blocks) ? res.data.blocks : next);
    } catch (err) {
      window.alert(errorMessage(err));
    } finally {
      setBusyId(null);
    }
  };

  if (!pageMeta) {
    return (
      <DashboardShell>
        <DashboardErrorState message="صفحة غير معروفة." />
      </DashboardShell>
    );
  }

  const sectionLabel = pageMeta.adminLabel;

  return (
    <DashboardShell>
      <DashboardPageHeader
        title={sectionLabel}
        description="أضف وعدّل ورتّب محتوى الصفحة. التصميم ثابت ولا يمكن تغييره من هنا."
        breadcrumbs={[
          ...editWebsiteBreadcrumbs("طريقة العمل").slice(0, -1),
          { label: "طريقة العمل", href: `${EDIT_WEBSITE_BASE}/how-it-works` },
          { label: sectionLabel },
        ]}
        actions={
          <Link to={`${EDIT_WEBSITE_BASE}/how-it-works`} className="btn btn-secondary btn-sm">
            رجوع
          </Link>
        }
      />

      <DashboardSection title="إعدادات الصفحة">
        <div className="oh-website-hiw-page-settings">
          <label className="oh-website-hiw-page-settings__title">
            عنوان الصفحة
            <input
              type="text"
              value={pageTitle}
              onChange={(e) => setPageTitle(e.target.value)}
              disabled={loading || savingTitle}
            />
          </label>
          <Button type="button" disabled={loading || savingTitle} onClick={savePageTitle}>
            {savingTitle ? "جاري الحفظ…" : "حفظ العنوان"}
          </Button>
          {page ? (
            <span
              className={`oh-website-hiw-page-card__badge${page.isActive ? " oh-website-hiw-page-card__badge--visible" : ""}`}
            >
              {page.isActive ? "ظاهرة" : "مخفية"}
            </span>
          ) : null}
        </div>
      </DashboardSection>

      <DashboardSection title="محتوى الصفحة">
        <div className="oh-website-faq-toolbar">
          <p className="oh-website-faq-toolbar__hint">
            أضف كتل محتوى (عنوان، نص، صورة، نص + صورة) ورتّبها كما تظهر للزائر.
          </p>
          <Button type="button" onClick={() => setModal({ open: true, mode: "create", item: null })}>
            إضافة محتوى
          </Button>
        </div>

        {loading ? <DashboardLoadingState label="جاري تحميل المحتوى…" /> : null}
        {!loading && error ? (
          <DashboardErrorState
            message={error}
            actions={
              <Button type="button" variant="secondary" onClick={loadPage}>
                إعادة المحاولة
              </Button>
            }
          />
        ) : null}
        {!loading && !error && blocks.length === 0 ? (
          <DashboardEmptyState
            title="لا يوجد محتوى"
            description="أضف أول كتلة محتوى لهذه الصفحة."
            actions={
              <Button type="button" onClick={() => setModal({ open: true, mode: "create", item: null })}>
                إضافة محتوى
              </Button>
            }
          />
        ) : null}

        {!loading && !error && blocks.length > 0 ? (
          <div className="oh-website-faq-list">
            {blocks.map((block, index) => (
              <article key={block.id} className="oh-website-faq-item oh-website-hiw-block-item">
                <div className="oh-website-faq-item__head">
                  <span className="oh-website-faq-item__order">{index + 1}</span>
                  <div className="oh-website-faq-item__body">
                    <p className="oh-website-hiw-block-item__type">{BLOCK_TYPE_LABELS[block.blockType]}</p>
                    <p className="oh-website-faq-item__question">{blockSummary(block)}</p>
                    {block.body && block.blockType !== "title" ? (
                      <p className="oh-website-faq-item__answer">{block.body}</p>
                    ) : null}
                    {block.imageUrl ? (
                      <div className="oh-website-hiw-block-item__thumb">
                        <img src={block.imageUrl} alt="" />
                      </div>
                    ) : null}
                    <div className="oh-website-faq-item__actions">
                      <Button
                        type="button"
                        variant="secondary"
                        disabled={busyId === block.id}
                        onClick={() => setModal({ open: true, mode: "edit", item: block })}
                      >
                        تعديل
                      </Button>
                      <Button
                        type="button"
                        variant="danger"
                        disabled={busyId === block.id}
                        onClick={() => handleDelete(block)}
                      >
                        حذف
                      </Button>
                    </div>
                  </div>
                  <div className="oh-website-faq-item__reorder">
                    <button
                      type="button"
                      aria-label="تحريك لأعلى"
                      disabled={index === 0 || busyId === block.id}
                      onClick={() => moveBlock(index, -1)}
                    >
                      ↑
                    </button>
                    <button
                      type="button"
                      aria-label="تحريك لأسفل"
                      disabled={index === blocks.length - 1 || busyId === block.id}
                      onClick={() => moveBlock(index, 1)}
                    >
                      ↓
                    </button>
                  </div>
                </div>
              </article>
            ))}
          </div>
        ) : null}
      </DashboardSection>

      <BlockFormModal
        mode={modal.mode}
        open={modal.open}
        initial={modal.item}
        slug={slug}
        onClose={() => setModal({ open: false, mode: "create", item: null })}
        onSaved={loadPage}
      />
    </DashboardShell>
  );
}
