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
import { HOW_IT_WORKS_SLUG_TO_PAGE } from "../../constants/howItWorksPages";
import { useTranslation } from "../../i18n/LanguageProvider";
import "../../i18n/siteEditorResources";
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

function blockTypeLabel(blockType, t) {
  const key = `siteEditor.blockTypes.${blockType}`;
  const label = t(key);
  return label === key ? t("siteEditor.blockTypes.content") : label;
}

function blockSummary(block, t) {
  if (block.blockType === "image") return block.title || block.imageUrl || t("siteEditor.blockTypes.image");
  if (block.title) return block.title;
  if (block.body) return block.body.slice(0, 80);
  return blockTypeLabel(block.blockType, t);
}

function BlockFormModal({ mode, open, initial, onClose, onSaved, slug }) {
  const { t } = useTranslation();
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

  const operationError = (err) => err?.response?.data?.message || t("siteEditor.errors.operationFailed");

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
      setError(t("siteEditor.errors.enterBlockTitle"));
      return;
    }
    if (blockType === "text" && !payload.title && !payload.body) {
      setError(t("siteEditor.errors.enterTitleOrText"));
      return;
    }
    if (blockType === "image" && !payload.imageUrl) {
      setError(t("siteEditor.errors.addImageOrUrl"));
      return;
    }
    if (blockType === "text_image" && !payload.title && !payload.body && !payload.imageUrl) {
      setError(t("siteEditor.errors.addTitleTextOrImage"));
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
      setError(operationError(err));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="oh-website-faq-modal" role="dialog" aria-modal="true">
      <button
        type="button"
        className="oh-website-faq-modal__backdrop"
        aria-label={t("siteEditor.common.close")}
        onClick={onClose}
      />
      <div className="oh-website-faq-modal__panel oh-website-faq-modal__panel--wide">
        <div className="oh-website-faq-modal__header">
          <h2>
            {isEdit ? t("siteEditor.howItWorksEditor.modalEditTitle") : t("siteEditor.howItWorksEditor.modalAddTitle")}
          </h2>
          <button
            type="button"
            className="oh-website-faq-modal__close"
            aria-label={t("siteEditor.common.close")}
            onClick={onClose}
          >
            ×
          </button>
        </div>
        <form className="oh-website-faq-form" onSubmit={handleSubmit}>
          <label>
            {t("siteEditor.howItWorksEditor.contentType")}
            <select value={blockType} onChange={(e) => setBlockType(e.target.value)} disabled={submitting || isEdit}>
              {BLOCK_TYPES.map((type) => (
                <option key={type} value={type}>
                  {blockTypeLabel(type, t)}
                </option>
              ))}
            </select>
          </label>
          {needsTitle ? (
            <label>
              {t("siteEditor.howItWorksEditor.fieldTitle")}
              <input type="text" value={title} onChange={(e) => setTitle(e.target.value)} disabled={submitting} />
            </label>
          ) : null}
          {needsBody ? (
            <label>
              {t("siteEditor.howItWorksEditor.fieldText")}
              <textarea value={body} onChange={(e) => setBody(e.target.value)} disabled={submitting} rows={5} />
            </label>
          ) : null}
          {needsImage ? (
            <div className="oh-website-faq-form__field">
              <span className="oh-website-faq-form__field-label">{t("siteEditor.howItWorksEditor.fieldImage")}</span>
              <WebsiteContentImagePicker value={imageUrl} onChange={setImageUrl} disabled={submitting} />
            </div>
          ) : null}
          {error ? <p className="oh-website-faq-form__error">{error}</p> : null}
          <div className="oh-website-faq-form__actions">
            <Button type="button" variant="secondary" onClick={onClose} disabled={submitting}>
              {t("siteEditor.common.cancel")}
            </Button>
            <Button type="submit" disabled={submitting}>
              {submitting
                ? t("siteEditor.common.saving")
                : isEdit
                  ? t("siteEditor.common.saveEdit")
                  : t("siteEditor.common.add")}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}

export default function SuperAdminEditWebsiteHowItWorksEditorPage() {
  const { t } = useTranslation();
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

  const operationError = useCallback(
    (err) => err?.response?.data?.message || t("siteEditor.errors.operationFailed"),
    [t],
  );

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
      setError(operationError(err));
      setPage(null);
      setBlocks([]);
    } finally {
      setLoading(false);
    }
  }, [slug, operationError]);

  useEffect(() => {
    loadPage();
  }, [loadPage]);

  const savePageTitle = async () => {
    const nextTitle = pageTitle.trim();
    if (!nextTitle) {
      window.alert(t("siteEditor.errors.enterPageTitle"));
      return;
    }
    setSavingTitle(true);
    try {
      await updateSuperAdminWebsitePageRequest(slug, { title: nextTitle });
      await loadPage();
    } catch (err) {
      window.alert(operationError(err));
    } finally {
      setSavingTitle(false);
    }
  };

  const handleDelete = async (block) => {
    const preview = blockSummary(block, t).slice(0, 48);
    if (!window.confirm(t("siteEditor.howItWorksEditor.deleteConfirm", { preview }))) return;
    setBusyId(block.id);
    try {
      await deleteSuperAdminWebsitePageBlockRequest(slug, block.id);
      await loadPage();
    } catch (err) {
      window.alert(operationError(err));
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
      window.alert(operationError(err));
    } finally {
      setBusyId(null);
    }
  };

  if (!pageMeta) {
    return (
      <DashboardShell>
        <DashboardErrorState message={t("siteEditor.howItWorksEditor.unknownPage")} />
      </DashboardShell>
    );
  }

  const sectionLabel = t(pageMeta.adminLabelKey);

  return (
    <DashboardShell>
      <DashboardPageHeader
        title={sectionLabel}
        description={t("siteEditor.howItWorksEditor.pageDescription")}
        breadcrumbs={[
          ...editWebsiteBreadcrumbs("dashboard.breadcrumbs.howItWorks").slice(0, -1),
          { labelKey: "dashboard.breadcrumbs.howItWorks", href: `${EDIT_WEBSITE_BASE}/how-it-works` },
          { label: sectionLabel },
        ]}
        actions={
          <Link to={`${EDIT_WEBSITE_BASE}/how-it-works`} className="btn btn-secondary btn-sm">
            {t("siteEditor.common.back")}
          </Link>
        }
      />

      <DashboardSection title={t("siteEditor.howItWorksEditor.pageSettingsTitle")}>
        <div className="oh-website-hiw-page-settings">
          <label className="oh-website-hiw-page-settings__title">
            {t("siteEditor.howItWorksEditor.pageTitleLabel")}
            <input
              type="text"
              value={pageTitle}
              onChange={(e) => setPageTitle(e.target.value)}
              disabled={loading || savingTitle}
            />
          </label>
          <Button type="button" disabled={loading || savingTitle} onClick={savePageTitle}>
            {savingTitle ? t("siteEditor.common.saving") : t("siteEditor.common.saveTitle")}
          </Button>
          {page ? (
            <span
              className={`oh-website-hiw-page-card__badge${page.isActive ? " oh-website-hiw-page-card__badge--visible" : ""}`}
            >
              {page.isActive ? t("siteEditor.common.visiblePage") : t("siteEditor.common.hiddenPage")}
            </span>
          ) : null}
        </div>
      </DashboardSection>

      <DashboardSection title={t("siteEditor.howItWorksEditor.contentSectionTitle")}>
        <div className="oh-website-faq-toolbar">
          <p className="oh-website-faq-toolbar__hint">{t("siteEditor.howItWorksEditor.contentHint")}</p>
          <Button type="button" onClick={() => setModal({ open: true, mode: "create", item: null })}>
            {t("siteEditor.howItWorksEditor.addContent")}
          </Button>
        </div>

        {loading ? <DashboardLoadingState label={t("siteEditor.common.loadingContent")} /> : null}
        {!loading && error ? (
          <DashboardErrorState
            message={error}
            actions={
              <Button type="button" variant="secondary" onClick={loadPage}>
                {t("siteEditor.common.retry")}
              </Button>
            }
          />
        ) : null}
        {!loading && !error && blocks.length === 0 ? (
          <DashboardEmptyState
            title={t("siteEditor.howItWorksEditor.emptyTitle")}
            description={t("siteEditor.howItWorksEditor.emptyDescription")}
            actions={
              <Button type="button" onClick={() => setModal({ open: true, mode: "create", item: null })}>
                {t("siteEditor.howItWorksEditor.addContent")}
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
                    <p className="oh-website-hiw-block-item__type">{blockTypeLabel(block.blockType, t)}</p>
                    <p className="oh-website-faq-item__question">{blockSummary(block, t)}</p>
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
                        {t("siteEditor.common.edit")}
                      </Button>
                      <Button
                        type="button"
                        variant="danger"
                        disabled={busyId === block.id}
                        onClick={() => handleDelete(block)}
                      >
                        {t("siteEditor.common.delete")}
                      </Button>
                    </div>
                  </div>
                  <div className="oh-website-faq-item__reorder">
                    <button
                      type="button"
                      aria-label={t("siteEditor.common.moveUp")}
                      disabled={index === 0 || busyId === block.id}
                      onClick={() => moveBlock(index, -1)}
                    >
                      ↑
                    </button>
                    <button
                      type="button"
                      aria-label={t("siteEditor.common.moveDown")}
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
