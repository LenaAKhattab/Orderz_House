import { useMemo } from "react";
import { Briefcase, CalendarDays, ShieldAlert, Target, Wallet } from "lucide-react";
import DashboardModal from "../dashboard/DashboardModal";
import {
  SPECIAL_OFFER_REFUND_SECTION_TITLES_AR,
  splitSpecialOfferRefundSections,
} from "../../constants/specialOfferPackage";
import "./specialOfferRefundDetailsModal.css";

function formatAmount(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return "—";
  return n.toLocaleString("en-US", { maximumFractionDigits: 2 });
}

const SECTION_ICONS = [Wallet, CalendarDays, Briefcase, ShieldAlert];

export default function SpecialOfferRefundDetailsModal({
  open,
  onClose,
  offer,
  t,
  triggerRef = null,
}) {
  const jod = t?.("plans.currency.jod") || "د.أ";
  const sections = useMemo(
    () => splitSpecialOfferRefundSections(offer?.refundExplanationAr),
    [offer?.refundExplanationAr],
  );

  const summaryItems = useMemo(() => {
    if (!offer) return [];
    const maxProject =
      offer.maxProjectValueJod != null
        ? `${t?.("plans.specialOffer.upTo") || "حتى"} ${formatAmount(offer.maxProjectValueJod)} ${jod}`
        : t?.("plans.specialOffer.unlimitedProjects") || "بلا سقف للمشاريع";
    return [
      {
        key: "offers",
        label: t?.("plans.specialOffer.totalOffers") || "عدد العروض",
        value: `${formatAmount(offer.totalOffers)} ${t?.("plans.specialOffer.available") || "متاح"}`,
        Icon: Target,
      },
      {
        key: "daily",
        label: t?.("plans.specialOffer.dailyLimit") || "حد يومي",
        value: `${formatAmount(offer.dailyLimit)} ${t?.("plans.specialOffer.offersPerDay") || "عرض يومياً"}`,
        Icon: CalendarDays,
      },
      {
        key: "max",
        label: t?.("plans.specialOffer.maxProject") || "الحد الأقصى للمشروع",
        value: maxProject,
        Icon: Briefcase,
      },
      {
        key: "duration",
        label: t?.("plans.specialOffer.durationShort") || "المدة",
        value: `${offer.durationDays} ${t?.("plans.specialOffer.days") || "يوم"}`,
        Icon: CalendarDays,
      },
    ];
  }, [offer, jod, t]);

  if (!offer) return null;

  return (
    <DashboardModal
      open={open}
      onClose={onClose}
      title={t?.("plans.specialOffer.refundModalTitle") || "تفاصيل استرداد مبلغ باقة العرض"}
      triggerRef={triggerRef}
      panelClassName="oh-special-offer-refund-modal__panel"
      footer={
        <button type="button" className="oh-special-offer-refund-modal__close-btn" onClick={onClose}>
          {t?.("plans.specialOffer.refundModalGotIt") || "فهمت"}
        </button>
      }
    >
      <div className="oh-special-offer-refund-modal">
        <div className="oh-special-offer-refund-modal__summary" aria-label={t?.("plans.specialOffer.refundSummaryAria") || "ملخص الباقة"}>
          {summaryItems.map(({ key, label, value, Icon }) => (
            <div key={key} className="oh-special-offer-refund-modal__summary-item">
              <span className="oh-special-offer-refund-modal__summary-icon" aria-hidden="true">
                <Icon size={14} strokeWidth={2} />
              </span>
              <div className="oh-special-offer-refund-modal__summary-copy">
                <span className="oh-special-offer-refund-modal__summary-label">{label}</span>
                <strong className="oh-special-offer-refund-modal__summary-value">{value}</strong>
              </div>
            </div>
          ))}
        </div>

        <div className="oh-special-offer-refund-modal__sections">
          {sections.map((body, index) => {
            const Icon = SECTION_ICONS[index] || ShieldAlert;
            const title =
              SPECIAL_OFFER_REFUND_SECTION_TITLES_AR[index] ||
              `${t?.("plans.specialOffer.refundSectionFallback") || "تفاصيل"} ${index + 1}`;
            return (
              <section key={`${index}-${title}`} className="oh-special-offer-refund-modal__section">
                <header className="oh-special-offer-refund-modal__section-head">
                  <span className="oh-special-offer-refund-modal__section-icon" aria-hidden="true">
                    <Icon size={15} strokeWidth={2.1} />
                  </span>
                  <h3 className="oh-special-offer-refund-modal__section-title">{title}</h3>
                </header>
                <p className="oh-special-offer-refund-modal__section-body">{body}</p>
              </section>
            );
          })}
        </div>
      </div>
    </DashboardModal>
  );
}
