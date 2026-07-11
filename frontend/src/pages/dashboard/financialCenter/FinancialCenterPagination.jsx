import { useMemo } from "react";
import { useTranslation } from "../../../i18n/LanguageProvider";

export const FC_TABLE_PAGE_SIZE = 5;

function buildPages(currentPage, totalPages) {
  if (totalPages <= 7) {
    return Array.from({ length: totalPages }, (_, i) => i + 1);
  }
  const pages = [1];
  const left = Math.max(2, currentPage - 1);
  const right = Math.min(totalPages - 1, currentPage + 1);
  if (left > 2) pages.push("…");
  for (let i = left; i <= right; i += 1) pages.push(i);
  if (right < totalPages - 1) pages.push("…");
  pages.push(totalPages);
  return pages;
}

/**
 * @param {{
 *   page: number;
 *   total: number;
 *   onPageChange: (page: number) => void;
 *   isLoading?: boolean;
 *   className?: string;
 * }} p
 */
export default function FinancialCenterPagination({
  page,
  total,
  onPageChange,
  isLoading = false,
  className = "",
}) {
  const { t } = useTranslation();

  const safeTotal = Math.max(0, Number(total) || 0);
  const safePageSize = FC_TABLE_PAGE_SIZE;
  const totalPages = Math.max(1, Math.ceil(safeTotal / safePageSize) || 1);
  const safePage = Math.min(Math.max(1, Number(page) || 1), totalPages);
  const from = safeTotal === 0 ? 0 : (safePage - 1) * safePageSize + 1;
  const to = safeTotal === 0 ? 0 : Math.min(safePage * safePageSize, safeTotal);

  const pageItems = useMemo(() => buildPages(safePage, totalPages), [safePage, totalPages]);

  if (safeTotal === 0) return null;

  const canPrev = safePage > 1 && !isLoading;
  const canNext = safePage < totalPages && !isLoading;
  const showControls = totalPages > 1;

  return (
    <div
      className={`fc-pagination${showControls ? "" : " fc-pagination--single"} ${className}`.trim()}
      dir="rtl"
    >
      <p className="fc-pagination__summary">
        {t("dashboard.financialCenter.pagination.showing", { from, to, total: safeTotal })}
      </p>

      {showControls ? (
        <div
          className="fc-pagination__controls"
          role="navigation"
          aria-label={t("dashboard.financialCenter.pagination.pageOf", { page: safePage, pages: totalPages })}
        >
          <button
            type="button"
            className="fc-pagination__btn"
            disabled={!canPrev}
            onClick={() => onPageChange(safePage - 1)}
          >
            {t("dashboard.financialCenter.pagination.previous")}
          </button>

          <div className="fc-pagination__numbers">
            {pageItems.map((item, idx) =>
              item === "…" ? (
                <span key={`dots-${idx}`} className="fc-pagination__dots" aria-hidden>
                  …
                </span>
              ) : (
                <button
                  key={item}
                  type="button"
                  className={`fc-pagination__num${item === safePage ? " fc-pagination__num--active" : ""}`}
                  disabled={item === safePage || isLoading}
                  aria-current={item === safePage ? "page" : undefined}
                  onClick={() => onPageChange(item)}
                >
                  {item}
                </button>
              ),
            )}
          </div>

          <button
            type="button"
            className="fc-pagination__btn"
            disabled={!canNext}
            onClick={() => onPageChange(safePage + 1)}
          >
            {t("dashboard.financialCenter.pagination.next")}
          </button>
        </div>
      ) : null}
    </div>
  );
}
