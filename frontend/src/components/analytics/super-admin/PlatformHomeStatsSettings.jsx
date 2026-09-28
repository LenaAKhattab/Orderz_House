import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "../../../i18n/LanguageProvider";
import "../../../i18n/opsAdminResources";
import { getPublicHomeStatsRequest } from "../../../services/api";
import HomeMetricsHelpCollapsible from "./HomeMetricsHelpCollapsible";

function formatPreviewNumber(value) {
  if (value == null || Number.isNaN(Number(value))) return "—";
  return new Intl.NumberFormat("ar-JO-u-nu-latn").format(Math.trunc(Number(value)));
}

function HomeStatsPreview({ showVisitors, showActiveUsers, visitors, activeUsers, loading }) {
  const { t } = useTranslation();
  const hp = "opsAdmin.homePublicStats";
  const hasAny = showVisitors || showActiveUsers;

  return (
    <div className="sa-home-preview" aria-live="polite">
      <p className="sa-home-preview__lead">{t(`${hp}.previewLead`)}</p>
      {!hasAny ? (
        <p className="sa-home-preview__empty">{t(`${hp}.previewEmpty`)}</p>
      ) : (
        <div className="sa-home-preview__row">
          {showVisitors ? (
            <div className="sa-home-preview__metric sa-home-preview__metric--visitors">
              <span className="sa-home-preview__value">{loading ? "…" : formatPreviewNumber(visitors)}</span>
              <span className="sa-home-preview__label">{t("home.metrics.views")}</span>
            </div>
          ) : null}
          {showActiveUsers ? (
            <div className="sa-home-preview__metric sa-home-preview__metric--active">
              <span className="sa-home-preview__value">{loading ? "…" : formatPreviewNumber(activeUsers)}</span>
              <span className="sa-home-preview__label">{t("home.metrics.activeUsers")}</span>
            </div>
          ) : null}
        </div>
      )}
    </div>
  );
}

function SettingToggleRow({ title, hint, checked, disabled, onChange, ariaLabel }) {
  return (
    <label
      className={`sa-platform-toggle${disabled ? " sa-platform-toggle--disabled" : ""}`}
    >
      <input
        type="checkbox"
        className="sa-platform-toggle__input"
        checked={checked}
        disabled={disabled}
        onChange={(e) => onChange(e.target.checked)}
        aria-label={ariaLabel}
      />
      <span className="sa-platform-toggle__switch" aria-hidden />
      <span className="sa-platform-toggle__copy">
        <span className="sa-platform-toggle__title">{title}</span>
        <span className="sa-platform-toggle__hint">{hint}</span>
      </span>
    </label>
  );
}

/**
 * Homepage public stats toggles + live preview (Super Admin platform settings).
 */
export default function PlatformHomeStatsSettings({
  open,
  showVisitors,
  showActiveUsers,
  busy,
  saving,
  onToggleVisitors,
  onToggleActiveUsers,
}) {
  const { t } = useTranslation();
  const hp = "opsAdmin.homePublicStats";
  const [preview, setPreview] = useState({ visitors: null, activeUsers: null });
  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewShowVisitors, setPreviewShowVisitors] = useState(showVisitors);
  const [previewShowActive, setPreviewShowActive] = useState(showActiveUsers);

  useEffect(() => {
    setPreviewShowVisitors(showVisitors);
  }, [showVisitors]);

  useEffect(() => {
    setPreviewShowActive(showActiveUsers);
  }, [showActiveUsers]);

  const loadPreview = useCallback(async () => {
    setPreviewLoading(true);
    try {
      const res = await getPublicHomeStatsRequest();
      const d = res?.data;
      setPreview({
        visitors: d?.visitors ?? null,
        activeUsers: d?.activeUsers ?? null,
      });
    } catch {
      setPreview({ visitors: null, activeUsers: null });
    } finally {
      setPreviewLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!open) return;
    void loadPreview();
  }, [open, loadPreview]);

  const disabled = busy || saving;

  return (
    <div className="sa-platform-settings">
      <HomeStatsPreview
        showVisitors={previewShowVisitors}
        showActiveUsers={previewShowActive}
        visitors={preview.visitors}
        activeUsers={preview.activeUsers}
        loading={previewLoading}
      />

      <div className="sa-platform-settings__toggles">
        <SettingToggleRow
          title={t(`${hp}.showViewsTitle`)}
          hint={t(`${hp}.showViewsHint`)}
          checked={showVisitors}
          disabled={disabled}
          onChange={(checked) => {
            setPreviewShowVisitors(checked);
            onToggleVisitors(checked);
          }}
          ariaLabel={t(`${hp}.showViewsAria`)}
        />
        <SettingToggleRow
          title={t(`${hp}.showActiveTitle`)}
          hint={t(`${hp}.showActiveHint`)}
          checked={showActiveUsers}
          disabled={disabled}
          onChange={(checked) => {
            setPreviewShowActive(checked);
            onToggleActiveUsers(checked);
          }}
          ariaLabel={t(`${hp}.showActiveAria`)}
        />
      </div>

      <HomeMetricsHelpCollapsible
        title={t(`${hp}.helpTitle`)}
        visitorsLine={t(`${hp}.helpVisitors`)}
        activeLine={t(`${hp}.helpActive`)}
      />
    </div>
  );
}
