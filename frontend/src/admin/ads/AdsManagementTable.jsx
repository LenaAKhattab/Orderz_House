import StatusBadge from "../../components/dashboard/StatusBadge";
import SafeAdImage from "../../components/ads/SafeAdImage";
import { getAdAdminStatus, formatCtr } from "./adAdminStatus";
import { priorityLabel } from "../../components/ads/bannerAdMeta";

function fmtDate(iso) {
  if (!iso) return "—";
  try {
    const d = new Date(iso);
    return Number.isNaN(d.getTime()) ? "—" : d.toLocaleString("ar");
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
  if (!ads.length) return null;

  return (
    <div className="oh-admin-ads__table-wrap">
      <table className="oh-admin-ads__table oh-admin-ads__table--mgmt">
        <thead>
          <tr>
            <th>صورة</th>
            <th>العنوان</th>
            <th>الشركة</th>
            <th>الحالة</th>
            <th>البداية</th>
            <th>النهاية</th>
            <th>ظهورات</th>
            <th>نقرات</th>
            <th>CTR</th>
            <th>آخر نقرة</th>
            <th>إجراءات</th>
          </tr>
        </thead>
        <tbody>
          {ads.map((ad) => {
            const status = getAdAdminStatus(ad, new Date(nowTick));
            const img = ad.images?.[0];
            const company = ad.companyName || "—";
            return (
              <tr key={ad.id}>
                <td className="oh-admin-ads__thumb-td">
                  {img?.url ? (
                    <SafeAdImage src={img.url} alt="" className="oh-admin-ads__thumb" imgClassName="oh-admin-ads__thumb-img" />
                  ) : (
                    <span className="oh-admin-ads__thumb-empty">—</span>
                  )}
                </td>
                <td className="oh-admin-ads__title-td">
                  <span className="oh-admin-ads__title-cell">{ad.title}</span>
                  {ad.priority > 0 ? (
                    <span className="oh-admin-ads__mini-tag">{priorityLabel(ad.priority)}</span>
                  ) : null}
                </td>
                <td>{company}</td>
                <td>
                  <StatusBadge tone={status.tone}>{status.label}</StatusBadge>
                </td>
                <td>{fmtDate(ad.startDate)}</td>
                <td>{fmtDate(ad.endDate)}</td>
                <td dir="ltr">{Number(ad.impressionCount) || 0}</td>
                <td dir="ltr">{Number(ad.clickCount) || 0}</td>
                <td dir="ltr">{formatCtr(ad.impressionCount, ad.clickCount)}</td>
                <td>{fmtDate(ad.lastClickedAt)}</td>
                <td>
                  <div className="oh-admin-ads__row-actions">
                    <button type="button" className="btn btn-secondary oh-admin-ads__row-btn" onClick={() => onEdit(ad)}>
                      تعديل
                    </button>
                    <button
                      type="button"
                      className="btn btn-secondary oh-admin-ads__row-btn"
                      onClick={() => onToggleActive(ad, !ad.isActive)}
                    >
                      {ad.isActive ? "تعطيل" : "تفعيل"}
                    </button>
                    <button type="button" className="btn btn-secondary oh-admin-ads__row-btn oh-admin-ads__row-btn--danger" onClick={() => onDelete(ad.id)}>
                      حذف
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
