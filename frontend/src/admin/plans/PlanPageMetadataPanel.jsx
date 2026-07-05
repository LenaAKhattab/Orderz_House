import { useEffect, useMemo, useState } from "react";
import Button from "../../components/ui/Button";
import { formatPlanPagePath } from "./planFormLinkingUtils";

function planPageToForm(page) {
  if (!page) {
    return { title: "", subtitle: "", titleEn: "", subtitleEn: "" };
  }
  return {
    title: page.title ?? "",
    subtitle: page.subtitle ?? "",
    titleEn: page.titleEn ?? "",
    subtitleEn: page.subtitleEn ?? "",
  };
}

function normalizePlanPagePatch(form) {
  return {
    title: form.title.trim(),
    subtitle: form.subtitle.trim() || null,
    titleEn: form.titleEn.trim() || null,
    subtitleEn: form.subtitleEn.trim() || null,
  };
}

/**
 * Edit hero copy for a public /plans/:slug page (plan_pages row).
 * @param {{
 *   page: Record<string, unknown> | null;
 *   isEn?: boolean;
 *   submitting?: boolean;
 *   onSave: (patch: Record<string, unknown>) => Promise<void> | void;
 * }} p
 */
export default function PlanPageMetadataPanel({ page, isEn = false, submitting = false, onSave }) {
  const [form, setForm] = useState(() => planPageToForm(page));
  const [expanded, setExpanded] = useState(true);

  useEffect(() => {
    setForm(planPageToForm(page));
  }, [page?.id, page?.updatedAt]);

  const canSave = useMemo(() => form.title.trim().length >= 2, [form.title]);

  if (!page) return null;

  const publicPath = formatPlanPagePath(page);

  return (
    <section className="oh-sapl-page-metadata" aria-labelledby="oh-sapl-page-metadata-title">
      <header className="oh-sapl-page-metadata__head">
        <div>
          <h3 id="oh-sapl-page-metadata-title" className="oh-sapl-page-metadata__title">
            {isEn ? "Page metadata" : "بيانات صفحة العرض"}
          </h3>
          <p className="oh-sapl-page-metadata__hint">
            {isEn
              ? `Hero title and subtitle on ${publicPath}`
              : `عنوان ووصف الصفحة على ${publicPath}`}
          </p>
        </div>
        <button
          type="button"
          className="oh-sapl-page-metadata__toggle"
          aria-expanded={expanded}
          onClick={() => setExpanded((v) => !v)}
        >
          {expanded ? (isEn ? "Collapse" : "طي") : isEn ? "Expand" : "فتح"}
        </button>
      </header>

      {expanded ? (
        <div className="oh-sapl-page-metadata__body">
          {page.slug ? (
            <p className="oh-sapl-page-metadata__slug">
              <span>{isEn ? "URL slug (read-only)" : "رابط الصفحة (للقراءة فقط)"}</span>
              <code dir="ltr">{String(page.slug)}</code>
            </p>
          ) : null}

          <div className="oh-sapl-page-metadata__grid">
            <label className="oh-sapl-page-metadata__field">
              <span>{isEn ? "Title (Arabic)" : "العنوان (عربي)"}</span>
              <input
                className="oh-sapl-input"
                value={form.title}
                onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
                disabled={submitting}
              />
            </label>
            <label className="oh-sapl-page-metadata__field">
              <span>{isEn ? "Title (English)" : "العنوان (إنجليزي)"}</span>
              <input
                className="oh-sapl-input"
                dir="ltr"
                value={form.titleEn}
                onChange={(e) => setForm((f) => ({ ...f, titleEn: e.target.value }))}
                disabled={submitting}
              />
            </label>
            <label className="oh-sapl-page-metadata__field oh-sapl-page-metadata__field--wide">
              <span>{isEn ? "Subtitle (Arabic)" : "الوصف (عربي)"}</span>
              <textarea
                className="oh-sapl-input oh-sapl-input--textarea"
                rows={2}
                value={form.subtitle}
                onChange={(e) => setForm((f) => ({ ...f, subtitle: e.target.value }))}
                disabled={submitting}
              />
            </label>
            <label className="oh-sapl-page-metadata__field oh-sapl-page-metadata__field--wide">
              <span>{isEn ? "Subtitle (English)" : "الوصف (إنجليزي)"}</span>
              <textarea
                className="oh-sapl-input oh-sapl-input--textarea"
                dir="ltr"
                rows={2}
                value={form.subtitleEn}
                onChange={(e) => setForm((f) => ({ ...f, subtitleEn: e.target.value }))}
                disabled={submitting}
              />
            </label>
          </div>

          <div className="oh-sapl-page-metadata__actions">
            <Button
              type="button"
              disabled={submitting || !canSave}
              onClick={() => void onSave(normalizePlanPagePatch(form))}
            >
              {submitting
                ? isEn
                  ? "Saving…"
                  : "جارٍ الحفظ…"
                : isEn
                  ? "Save page metadata"
                  : "حفظ بيانات الصفحة"}
            </Button>
          </div>
        </div>
      ) : null}
    </section>
  );
}
