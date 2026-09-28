import { useState } from "react";
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
    return Number.isNaN(d.getTime())
      ? "—"
      : d.toLocaleDateString(locale === "en" ? "en" : "ar", { month: "short", day: "numeric" });
  } catch {
    return "—";
  }
}

/**
 * @param {object} p
 * @param {import("../../types/ad.js").Ad[]} p.ads
 * @param {(fromIndex: number, toIndex: number) => void} p.onReorder
 * @param {boolean} p.busy
 * @param {number} p.nowTick
 */
export default function AdsReorderSection({ ads, onReorder, busy, nowTick }) {
  const { t, locale } = useTranslation();
  const [dragIdx, setDragIdx] = useState(null);
  const [overIdx, setOverIdx] = useState(null);

  if (!ads.length) {
    return <p className="oh-admin-ads__reorder-empty">{t("ads.reorder.empty")}</p>;
  }

  const handleDrop = (targetIdx) => {
    if (dragIdx == null || dragIdx === targetIdx) return;
    onReorder(dragIdx, targetIdx);
    setDragIdx(null);
    setOverIdx(null);
  };

  return (
    <ul className="oh-admin-ads__reorder-cards" aria-busy={busy}>
      {ads.map((ad, idx) => {
        const status = getAdAdminStatus(ad, new Date(nowTick));
        const img = ad.images?.[0];
        const imp = Number(ad.impressionCount) || 0;
        const clk = Number(ad.clickCount) || 0;
        const isDragging = dragIdx === idx;
        const isOver = overIdx === idx && dragIdx != null && dragIdx !== idx;

        return (
          <li
            key={ad.id}
            className={`oh-admin-ads__reorder-card${isDragging ? " oh-admin-ads__reorder-card--drag" : ""}${isOver ? " oh-admin-ads__reorder-card--over" : ""}`}
            draggable={!busy}
            onDragStart={() => setDragIdx(idx)}
            onDragEnd={() => {
              setDragIdx(null);
              setOverIdx(null);
            }}
            onDragOver={(e) => {
              e.preventDefault();
              setOverIdx(idx);
            }}
            onDragLeave={() => setOverIdx((v) => (v === idx ? null : v))}
            onDrop={(e) => {
              e.preventDefault();
              handleDrop(idx);
            }}
          >
            <span className="oh-admin-ads__reorder-grip" aria-hidden title={t("ads.reorder.dragTitle")}>
              ⠿
            </span>
            <span className="oh-admin-ads__reorder-rank">{idx + 1}</span>
            <span className="oh-admin-ads__reorder-thumb">
              {img?.url ? (
                <SafeAdImage src={img.url} alt="" className="oh-admin-ads__thumb" imgClassName="oh-admin-ads__thumb-img" />
              ) : (
                <span className="oh-admin-ads__thumb-empty">{t("ads.common.emDash")}</span>
              )}
            </span>
            <div className="oh-admin-ads__reorder-card-body">
              <strong className="oh-admin-ads__reorder-title">{ad.title}</strong>
              <span className="oh-admin-ads__reorder-sub">{ad.companyName || t("ads.common.emDash")}</span>
              <div className="oh-admin-ads__reorder-meta-row">
                <StatusBadge tone={status.tone}>{t(`ads.status.${status.key}.label`)}</StatusBadge>
                {ad.priority > 0 ? <span className="oh-admin-ads__mini-tag">{priorityLabel(ad.priority, t)}</span> : null}
              </div>
              <div className="oh-admin-ads__reorder-stats" dir="ltr">
                <span title={t("ads.table.impressionsTitle")}>
                  {imp} {t("ads.table.impressionsAbbr")}
                </span>
                <span title={t("ads.table.clicksTitle")}>
                  {clk} {t("ads.table.clicksAbbr")}
                </span>
                <span title={t("ads.table.ctr")}>{formatCtr(imp, clk)} CTR</span>
                <span>
                  {fmtDate(ad.startDate, locale)} – {fmtDate(ad.endDate, locale)}
                </span>
              </div>
            </div>
          </li>
        );
      })}
    </ul>
  );
}
