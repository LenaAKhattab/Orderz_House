import { useCallback, useEffect, useState } from "react";
import { getPublicHomeStatsRequest } from "../../../services/api";
import { HOME_PUBLIC_METRICS, HOME_METRICS_ADMIN_HELP } from "../../../constants/homeAnalyticsMetrics";
import HomeMetricsHelpCollapsible from "./HomeMetricsHelpCollapsible";

function formatPreviewNumber(value) {
  if (value == null || Number.isNaN(Number(value))) return "—";
  return new Intl.NumberFormat("ar-JO-u-nu-latn").format(Math.trunc(Number(value)));
}

function HomeStatsPreview({ showVisitors, showActiveUsers, visitors, activeUsers, loading }) {
  const hasAny = showVisitors || showActiveUsers;

  return (
    <div className="sa-home-preview" aria-live="polite">
      <p className="sa-home-preview__lead">سيظهر للزوار:</p>
      {!hasAny ? (
        <p className="sa-home-preview__empty">لن تُعرض أرقام في الصفحة الرئيسية.</p>
      ) : (
        <div className="sa-home-preview__row">
          {showVisitors ? (
            <div className="sa-home-preview__metric sa-home-preview__metric--visitors">
              <span className="sa-home-preview__value">{loading ? "…" : formatPreviewNumber(visitors)}</span>
              <span className="sa-home-preview__label">{HOME_PUBLIC_METRICS.views.label}</span>
            </div>
          ) : null}
          {showActiveUsers ? (
            <div className="sa-home-preview__metric sa-home-preview__metric--active">
              <span className="sa-home-preview__value">{loading ? "…" : formatPreviewNumber(activeUsers)}</span>
              <span className="sa-home-preview__label">{HOME_PUBLIC_METRICS.active.label}</span>
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
          title="عرض مشاهدات الموقع"
          hint="إظهار إجمالي مشاهدات الصفحات في الصفحة الرئيسية"
          checked={showVisitors}
          disabled={disabled}
          onChange={(checked) => {
            setPreviewShowVisitors(checked);
            onToggleVisitors(checked);
          }}
          ariaLabel="عرض مشاهدات الموقع في الصفحة الرئيسية"
        />
        <SettingToggleRow
          title="عرض المستخدمين النشطين"
          hint="إظهار عدد المستخدمين النشطين في الصفحة الرئيسية"
          checked={showActiveUsers}
          disabled={disabled}
          onChange={(checked) => {
            setPreviewShowActive(checked);
            onToggleActiveUsers(checked);
          }}
          ariaLabel="عرض المستخدمين النشطين في الصفحة الرئيسية"
        />
      </div>

      <HomeMetricsHelpCollapsible
        title={HOME_METRICS_ADMIN_HELP.title}
        visitorsLine={HOME_METRICS_ADMIN_HELP.visitors}
        activeLine={HOME_METRICS_ADMIN_HELP.active}
      />
    </div>
  );
}
