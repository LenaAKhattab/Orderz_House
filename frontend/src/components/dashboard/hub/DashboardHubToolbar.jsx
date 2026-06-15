import { useTranslation } from "../../../i18n/LanguageProvider";

export default function DashboardHubToolbar({
  searchValue,
  onSearchChange,
  searchPlaceholder,
  sortValue,
  onSortChange,
  sortOptions,
  onRefresh,
  refreshing = false,
  refreshLabel,
}) {
  const { t } = useTranslation();

  const resolvedSearchPlaceholder = searchPlaceholder ?? t("freelancerDashboard.toolbar.searchPlaceholder");
  const resolvedRefreshLabel = refreshLabel ?? t("freelancerDashboard.toolbar.refreshList");

  return (
    <div className="fdash-toolbar">
      {onSearchChange != null ? (
        <div className="fdash-toolbar__search">
          <span className="fdash-toolbar__search-icon" aria-hidden>
            🔍
          </span>
          <input
            type="search"
            className="fdash-toolbar__search-input"
            value={searchValue}
            onChange={(e) => onSearchChange(e.target.value)}
            placeholder={resolvedSearchPlaceholder}
            aria-label={resolvedSearchPlaceholder}
          />
        </div>
      ) : null}
      <div className="fdash-toolbar__actions">
        {sortOptions?.length ? (
          <select
            className="fdash-toolbar__select"
            value={sortValue}
            onChange={(e) => onSortChange?.(e.target.value)}
            aria-label={t("freelancerDashboard.toolbar.sortAriaLabel")}
          >
            {sortOptions.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
        ) : null}
        {onRefresh ? (
          <button
            type="button"
            className="fdash-toolbar__btn"
            disabled={refreshing}
            onClick={onRefresh}
          >
            {refreshing ? t("freelancerDashboard.toolbar.refreshing") : resolvedRefreshLabel}
          </button>
        ) : null}
      </div>
    </div>
  );
}
