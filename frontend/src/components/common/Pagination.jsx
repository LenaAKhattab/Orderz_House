import { useMemo } from "react";

function buildPages(currentPage, totalPages, siblingCount) {
  const pages = [];
  const maxButtons = siblingCount * 2 + 5;
  if (totalPages <= maxButtons) {
    for (let i = 1; i <= totalPages; i += 1) pages.push(i);
    return pages;
  }

  const left = Math.max(1, currentPage - siblingCount);
  const right = Math.min(totalPages, currentPage + siblingCount);

  pages.push(1);
  if (left > 2) pages.push("...");
  for (let i = left; i <= right; i += 1) {
    if (i !== 1 && i !== totalPages) pages.push(i);
  }
  if (right < totalPages - 1) pages.push("...");
  pages.push(totalPages);
  return pages;
}

export default function Pagination({
  currentPage,
  totalPages,
  onPageChange,
  isLoading = false,
  siblingCount = 1,
  className = "",
}) {
  const safeCurrent = Math.max(1, Number(currentPage) || 1);
  const safeTotal = Math.max(1, Number(totalPages) || 1);
  const pageItems = useMemo(
    () => buildPages(safeCurrent, safeTotal, Math.max(0, Number(siblingCount) || 0)),
    [safeCurrent, safeTotal, siblingCount],
  );

  const canPrev = safeCurrent > 1 && !isLoading;
  const canNext = safeCurrent < safeTotal && !isLoading;

  return (
    <div className={`app-pagination ${className}`.trim()}>
      <div className="app-pagination__controls" role="navigation" aria-label="الترقيم">
        <button
          type="button"
          className="app-pagination__btn app-pagination__btn--next"
          disabled={!canNext}
          onClick={() => onPageChange(safeCurrent + 1)}
        >
          <span aria-hidden>←</span>
          <span>التالي</span>
        </button>

        <div className="app-pagination__numbers" aria-hidden={safeTotal <= 1}>
          {pageItems.map((item, idx) =>
            item === "..." ? (
              <span key={`dots-${idx}`} className="app-pagination__dots">
                ...
              </span>
            ) : (
              <button
                key={item}
                type="button"
                className={`app-pagination__num ${item === safeCurrent ? "is-active" : ""}`.trim()}
                onClick={() => onPageChange(item)}
                disabled={item === safeCurrent || isLoading}
                aria-current={item === safeCurrent ? "page" : undefined}
              >
                {item}
              </button>
            ),
          )}
        </div>

        <button
          type="button"
          className="app-pagination__btn app-pagination__btn--prev"
          disabled={!canPrev}
          onClick={() => onPageChange(safeCurrent - 1)}
        >
          <span>السابق</span>
          <span aria-hidden>→</span>
        </button>
      </div>

      <div className="app-pagination__meta">الصفحة {safeCurrent} من {safeTotal}</div>
    </div>
  );
}
