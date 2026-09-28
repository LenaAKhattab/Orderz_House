import StatusBadge from "../../components/dashboard/StatusBadge";
import SafeAdImage from "../../components/ads/SafeAdImage";
import { getAdAdminStatus, formatCtr } from "./adAdminStatus";
import { priorityLabel } from "../../components/ads/bannerAdMeta";
import { useTranslation } from "../../i18n/LanguageProvider";
import "../../i18n/adsResources";

function fmtDate(iso, locale) {
  if (!iso) return "—";
  try {
    const d = new Date(iso);
    return Number.isNaN(d.getTime()) ? "—" : d.toLocaleString(locale === "en" ? "en" : "ar");
  } catch {
    return "—";
  }
}

/**
 * @param {object} p
 * @param {import("../../types/ad.js").Ad[]} p.ads
 * @param {(ad: object) => void} p.onEdit
 * @param {(ad: object, nextActive: boolean) => void} p.onToggleActive
 * @param {(id: string) => void} p.onDelete
 * @param {number} p.nowTick
 */
export default function AdsManagementTable({ ads, onEdit, onToggleActive, onDelete, nowTick }) {
  const { t, locale } = useTranslation();

  if (!ads.length) return null;

  return (
    <div className="oh-admin-ads__table-wrap">
      <table className="oh-admin-ads__table oh-admin-ads__table--mgmt">
        <thead>
          <tr>
            <th>{t("ads.table.image")}</th>
            <th>{t("ads.table.title")}</th>
            <th>{t("ads.table.company")}</th>
            <th>{t("ads.table.status")}</th>
            <th>{t("ads.table.start")}</th>
            <th>{t("ads.table.end")}</th>
            <th>{t("ads.table.impressions")}</th>
            <th>{t("ads.table.clicks")}</th>
            <th>{t("ads.table.ctr")}</th>
            <th>{t("ads.table.lastClick")}</th>
            <th>{t("ads.table.actions")}</th>
          </tr>
        </thead>
        <tbody>
          {ads.map((ad) => {
            const status = getAdAdminStatus(ad, new Date(nowTick));
            const img = ad.images?.[0];
            const company = ad.companyName || t("ads.common.emDash");
            return (
              <tr key={ad.id}>
                <td className="oh-admin-ads__thumb-td">
                  {img?.url ? (
                    <SafeAdImage src={img.url} alt="" className="oh-admin-ads__thumb" imgClassName="oh-admin-ads__thumb-img" />
                  ) : (
                    <span className="oh-admin-ads__thumb-empty">{t("ads.common.emDash")}</span>
                  )}
                </td>
                <td className="oh-admin-ads__title-td">
                  <span className="oh-admin-ads__title-cell">{ad.title}</span>
                  {ad.priority > 0 ? (
                    <span className="oh-admin-ads__mini-tag">{priorityLabel(ad.priority, t)}</span>
                  ) : null}
                </td>
                <td>{company}</td>
                <td>
                  <StatusBadge tone={status.tone}>{t(`ads.status.${status.key}.label`)}</StatusBadge>
                </td>
                <td>{fmtDate(ad.startDate, locale)}</td>
                <td>{fmtDate(ad.endDate, locale)}</td>
                <td dir="ltr">{Number(ad.impressionCount) || 0}</td>
                <td dir="ltr">{Number(ad.clickCount) || 0}</td>
                <td dir="ltr">{formatCtr(ad.impressionCount, ad.clickCount)}</td>
                <td>{fmtDate(ad.lastClickedAt, locale)}</td>
                <td>
                  <div className="oh-admin-ads__row-actions">
                    <button type="button" className="btn btn-secondary oh-admin-ads__row-btn" onClick={() => onEdit(ad)}>
                      {t("ads.common.edit")}
                    </button>
                    <button
                      type="button"
                      className="btn btn-secondary oh-admin-ads__row-btn"
                      onClick={() => onToggleActive(ad, !ad.isActive)}
                    >
                      {ad.isActive ? t("ads.common.disable") : t("ads.common.enable")}
                    </button>
                    <button type="button" className="btn btn-secondary oh-admin-ads__row-btn oh-admin-ads__row-btn--danger" onClick={() => onDelete(ad.id)}>
                      {t("ads.common.delete")}
                    </button>
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
