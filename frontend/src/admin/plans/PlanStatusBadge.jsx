const VARIANTS = {
  active: { className: "oh-sapl-badge oh-sapl-badge--success", label: "مفعّلة" },
  inactive: { className: "oh-sapl-badge oh-sapl-badge--muted", label: "معطّلة" },
  visible: { className: "oh-sapl-badge oh-sapl-badge--info", label: "معروضة" },
  hidden: { className: "oh-sapl-badge oh-sapl-badge--muted", label: "مخفية" },
  visit: { className: "oh-sapl-badge oh-sapl-badge--amber", label: "زيارة ميدانية" },
  selfServe: { className: "oh-sapl-badge oh-sapl-badge--violet", label: "شراء ذاتي" },
  listed: { className: "oh-sapl-badge oh-sapl-badge--teal", label: "في المتجر" },
};

/**
 * @param {{ variant: keyof typeof VARIANTS }} p
 */
export default function PlanStatusBadge({ variant }) {
  const v = VARIANTS[variant];
  if (!v) return null;
  return <span className={v.className}>{v.label}</span>;
}
