import { useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "../../../i18n/LanguageProvider";
import { useToast } from "../../../components/ui/toastContext";
import { createFinancialCenterDepartmentRequest } from "../../../services/api";
import { departmentOptionLabel } from "./financialDepartmentLabels";

/**
 * Searchable department combobox with inline create.
 */
export default function FinancialDepartmentCombobox({
  value,
  onChange,
  departments,
  onDepartmentCreated,
  disabled = false,
  placeholder,
}) {
  const { t } = useTranslation();
  const { push } = useToast();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [creating, setCreating] = useState(false);
  const wrapRef = useRef(null);

  useEffect(() => {
    const onDown = (e) => {
      const el = wrapRef.current;
      if (!el?.contains(e.target)) setOpen(false);
    };
    document.addEventListener("mousedown", onDown, true);
    document.addEventListener("touchstart", onDown, true);
    return () => {
      document.removeEventListener("mousedown", onDown, true);
      document.removeEventListener("touchstart", onDown, true);
    };
  }, []);

  const options = useMemo(
    () =>
      (departments || []).map((d) => ({
        value: String(d.id),
        label: departmentOptionLabel(d, t),
        raw: d,
      })),
    [departments, t],
  );

  const selected = options.find((o) => String(o.value) === String(value)) || null;
  const qTrim = String(query || "").trim();
  const qLower = qTrim.toLowerCase();

  const filtered = useMemo(() => {
    if (!qLower) return options;
    return options.filter(
      (o) =>
        String(o.label).toLowerCase().includes(qLower) ||
        String(o.raw?.name || "").toLowerCase().includes(qLower),
    );
  }, [options, qLower]);

  const exactMatch = useMemo(
    () =>
      options.some(
        (o) =>
          String(o.raw?.name || "").trim().toLowerCase() === qLower ||
          String(o.label).trim().toLowerCase() === qLower,
      ),
    [options, qLower],
  );

  const canCreate = Boolean(qTrim) && !exactMatch && !creating;

  const handleCreate = async () => {
    if (!canCreate) return;
    setCreating(true);
    try {
      const res = await createFinancialCenterDepartmentRequest({ name: qTrim });
      const dept = res?.data?.department;
      if (dept) {
        onDepartmentCreated?.(dept);
        onChange(String(dept.id));
        setQuery("");
        setOpen(false);
        push(t("dashboard.financialCenter.departmentCreated"), "success");
      }
    } catch (e) {
      if (e?.response?.status === 409) {
        const existing = (departments || []).find((d) => String(d.name || "").trim().toLowerCase() === qLower);
        if (existing) {
          onChange(String(existing.id));
          setQuery("");
          setOpen(false);
          return;
        }
      }
      push(e?.response?.data?.message || t("dashboard.financialCenter.departmentCreateError"), "error");
    } finally {
      setCreating(false);
    }
  };

  return (
    <div className="oh-select fc-dept-combobox" ref={wrapRef}>
      <button
        type="button"
        className={`oh-select__btn input ${open ? "oh-select__btn--open" : ""}`.trim()}
        onClick={() => {
          if (disabled) return;
          setOpen((v) => !v);
        }}
        aria-haspopup="listbox"
        aria-expanded={open}
        disabled={disabled}
      >
        <span className={`oh-select__value ${selected ? "" : "oh-select__value--placeholder"}`.trim()}>
          {selected ? selected.label : placeholder || t("dashboard.financialCenter.selectDepartment")}
        </span>
        <span className="oh-select__chev" aria-hidden="true">
          ▾
        </span>
      </button>

      {open ? (
        <div className="oh-select__panel" role="listbox">
          <div className="oh-select__search">
            <input
              className="input"
              value={query}
              placeholder={t("dashboard.financialCenter.searchDepartment")}
              onChange={(e) => setQuery(e.target.value)}
              autoFocus
              disabled={creating}
            />
          </div>
          <div className="oh-select__options">
            {filtered.map((opt) => (
              <button
                key={opt.value}
                type="button"
                className={`oh-select__opt ${String(value) === String(opt.value) ? "oh-select__opt--active" : ""}`.trim()}
                onClick={() => {
                  onChange(opt.value);
                  setQuery("");
                  setOpen(false);
                }}
              >
                <div className="oh-select__opt-label">{opt.label}</div>
              </button>
            ))}
            {canCreate ? (
              <button type="button" className="oh-select__opt oh-select__opt--create" onClick={() => void handleCreate()}>
                <div className="oh-select__opt-label">
                  {t("dashboard.financialCenter.addDepartmentNamed", { name: qTrim })}
                </div>
              </button>
            ) : null}
            {!filtered.length && !canCreate ? (
              <div className="oh-select__empty">{t("dashboard.financialCenter.noDepartmentResults")}</div>
            ) : null}
          </div>
          <p className="fc-dept-combobox__hint m-0">{t("dashboard.financialCenter.addDepartmentHint")}</p>
        </div>
      ) : null}
    </div>
  );
}
