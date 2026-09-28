import { useMemo } from "react";
import { Briefcase, CalendarDays, ShieldAlert, Target, Wallet } from "lucide-react";
import DashboardModal from "../dashboard/DashboardModal";
import {
  SPECIAL_OFFER_REFUND_SECTION_TITLES_AR,
  splitSpecialOfferRefundSections,
} from "../../constants/specialOfferPackage";
import { useTranslation } from "../../i18n/LanguageProvider";

const REFUND_SECTION_TITLE_KEYS = [
  "plans.specialOffer.refundSections.monthly",
  "plans.specialOffer.refundSections.inactiveMonths",
  "plans.specialOffer.refundSections.orderIncome",
  "plans.specialOffer.refundSections.importantNotice",
];
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
  const { t: tHook } = useTranslation();
  const tr = (key, params) => (t ?? tHook)(key, params);
  const jod = tr("plans.currency.jod");
  const sections = useMemo(
    () => splitSpecialOfferRefundSections(offer?.refundExplanationAr),
    [offer?.refundExplanationAr],
  );

  const summaryItems = useMemo(() => {
    if (!offer) return [];
    const maxProject =
      offer.maxProjectValueJod != null
        ? `${tr("plans.specialOffer.upTo")} ${formatAmount(offer.maxProjectValueJod)} ${jod}`
        : tr("plans.specialOffer.unlimitedProjects");
    return [
      {
        key: "offers",
        label: tr("plans.specialOffer.totalOffers"),
        value: `${formatAmount(offer.totalOffers)} ${tr("plans.specialOffer.available")}`,
        Icon: Target,
      },
      {
        key: "daily",
        label: tr("plans.specialOffer.dailyLimit"),
        value: `${formatAmount(offer.dailyLimit)} ${tr("plans.specialOffer.offersPerDay")}`,
        Icon: CalendarDays,
      },
      {
        key: "max",
        label: tr("plans.specialOffer.maxProject"),
        value: maxProject,
        Icon: Briefcase,
      },
      {
        key: "duration",
        label: tr("plans.specialOffer.durationShort"),
        value: `${offer.durationDays} ${tr("plans.specialOffer.days")}`,
        Icon: CalendarDays,
      },
    ];
  }, [offer, jod, t, tHook]);

  if (!offer) return null;

  return (
    <DashboardModal
      open={open}
      onClose={onClose}
      title={tr("plans.specialOffer.refundModalTitle")}
      triggerRef={triggerRef}
      panelClassName="oh-special-offer-refund-modal__panel"
      footer={
        <button type="button" className="oh-special-offer-refund-modal__close-btn" onClick={onClose}>
          {tr("plans.specialOffer.refundModalGotIt")}
        </button>
      }
    >
      <div className="oh-special-offer-refund-modal">
        <div className="oh-special-offer-refund-modal__summary" aria-label={tr("plans.specialOffer.refundSummaryAria")}>
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
              tr(REFUND_SECTION_TITLE_KEYS[index]) ||
              SPECIAL_OFFER_REFUND_SECTION_TITLES_AR[index] ||
              `${tr("plans.specialOffer.refundSectionFallback")} ${index + 1}`;
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
