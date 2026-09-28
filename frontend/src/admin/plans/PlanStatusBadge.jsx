import { useTranslation } from "../../i18n/LanguageProvider";

const VARIANTS = {
  active: { className: "oh-sapl-badge oh-sapl-badge--success", key: "planAdmin.badges.active" },
  inactive: { className: "oh-sapl-badge oh-sapl-badge--muted", key: "planAdmin.badges.inactive" },
  visible: { className: "oh-sapl-badge oh-sapl-badge--info", key: "planAdmin.badges.visible" },
  hidden: { className: "oh-sapl-badge oh-sapl-badge--muted", key: "planAdmin.badges.hidden" },
  visit: { className: "oh-sapl-badge oh-sapl-badge--amber", key: "planAdmin.badges.visit" },
  selfServe: { className: "oh-sapl-badge oh-sapl-badge--violet", key: "planAdmin.badges.selfServe" },
  listed: { className: "oh-sapl-badge oh-sapl-badge--teal", key: "planAdmin.badges.listed" },
};

export default function PlanStatusBadge({ variant }) {
  const { t } = useTranslation();
  const spec = VARIANTS[variant] || VARIANTS.inactive;
  return <span className={spec.className}>{t(spec.key)}</span>;
}
