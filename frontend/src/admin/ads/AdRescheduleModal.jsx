import { useMemo, useState } from "react";

/** @typedef {'simple' | 'schedule' | 'off'} RescheduleMode */

function dt(iso) {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const p = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
}

function toDatetimeLocalValue(d) {
  const p = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
}

function toIsoOrNull(v) {
  if (!v || !String(v).trim()) return null;
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

/** @param {object | undefined} ad */
function inferInitialMode(ad) {
  if (!ad?.isActive) return "off";
  if (ad.startDate || ad.endDate) return "schedule";
  return "simple";
}

/**
 * @param {{ ad: object, statusLabel: string, onClose: () => void, onSubmit: (payload: object) => Promise<void> }} props
 */
export default function AdRescheduleModal({ ad, statusLabel, onClose, onSubmit }) {
  const adTitle = ad?.title || "—";

  const [mode, setMode] = useState(() => inferInitialMode(ad));
  const [startDate, setStartDate] = useState(() => dt(ad?.startDate));
  const [endDate, setEndDate] = useState(() => dt(ad?.endDate));
  const [saving, setSaving] = useState(false);

  const selectMode = (next) => {
    setMode(next);
    if (next === "simple") {
      setStartDate("");
      setEndDate("");
    }
    if (next === "off") {
      /* dates unchanged — keep state for API diff / إيقاف */
    }
    if (next === "schedule") {
      /* keep current field values; if switching from simple with empty, fields stay empty */
    }
  };

  const setStartToday = () => setStartDate(toDatetimeLocalValue(new Date()));
  const setStartTomorrow = () => {
    const d = new Date();
    d.setDate(d.getDate() + 1);
    d.setHours(9, 0, 0, 0);
    setStartDate(toDatetimeLocalValue(d));
  };
  const setStartNextWeek = () => {
    const d = new Date();
    d.setDate(d.getDate() + 7);
    setStartDate(toDatetimeLocalValue(d));
  };
  const clearEnd = () => setEndDate("");

  const scheduleInvalid = useMemo(() => {
    if (mode !== "schedule") return false;
    const s = startDate ? new Date(startDate).getTime() : NaN;
    const e = endDate ? new Date(endDate).getTime() : NaN;
    if (Number.isNaN(s) || Number.isNaN(e)) return false;
    return e < s;
  }, [mode, startDate, endDate]);

  const endInPastWarning = useMemo(() => {
    if (mode !== "schedule" || !endDate) return false;
    const e = new Date(endDate).getTime();
    if (Number.isNaN(e)) return false;
    return e < Date.now();
  }, [mode, endDate]);

  const summaryText = useMemo(() => {
    if (mode === "simple") {
      return "النتيجة: سيظهر الإعلان فورًا ويبقى ظاهرًا طالما أنه مفعّل، دون جدولة بتاريخ بداية أو نهاية.";
    }
    if (mode === "off") {
      return "النتيجة: سيتم إخفاء الإعلان عن المستخدمين.";
    }
    const hasS = Boolean(startDate?.trim());
    const hasE = Boolean(endDate?.trim());
    const fmt = (v) => {
      if (!v?.trim()) return "";
      const d = new Date(v);
      return Number.isNaN(d.getTime()) ? v : d.toLocaleString("ar");
    };
    if (hasS && hasE) {
      return `النتيجة: سيظهر الإعلان من ${fmt(startDate)} حتى ${fmt(endDate)}.`;
    }
    if (hasS && !hasE) {
      return `النتيجة: سيبدأ الإعلان في ${fmt(startDate)} بدون تاريخ نهاية.`;
    }
    if (!hasS && hasE) {
      return `النتيجة: سيظهر الإعلان فورًا وينتهي في ${fmt(endDate)}.`;
    }
    return "النتيجة: الإعلان سيظهر فورًا بدون تاريخ نهاية.";
  }, [mode, startDate, endDate]);

  const buildPayload = () => {
    if (mode === "simple") {
      return { isActive: true, startDate: null, endDate: null };
    }
    if (mode === "off") {
      return {
        isActive: false,
        startDate: toIsoOrNull(startDate),
        endDate: toIsoOrNull(endDate),
      };
    }
    return {
      isActive: true,
      startDate: toIsoOrNull(startDate),
      endDate: toIsoOrNull(endDate),
    };
  };

  const handleSave = async () => {
    if (scheduleInvalid) return;
    setSaving(true);
    try {
      await onSubmit(buildPayload());
      onClose();
    } catch {
      /* parent toast */
    } finally {
      setSaving(false);
    }
  };

  const cards = [
    {
      id: "simple",
      label: "تشغيل فوري بدون جدولة",
      description: "يظهر الإعلان فورًا للزوار ويبقى ظاهرًا طالما أنه مفعّل هنا، دون وقت بداية أو نهاية.",
      icon: (
        <svg className="oh-ad-reschedule-card__icon" width="22" height="22" viewBox="0 0 24 24" aria-hidden>
          <path
            fill="currentColor"
            d="M12 4a8 8 0 100 16 8 8 0 000-16zm3.5 8.5l-4 2.5a.5.5 0 01-.78-.41v-5a.5.5 0 01.78-.41l4 2.5a.5.5 0 010 .82z"
          />
        </svg>
      ),
    },
    {
      id: "schedule",
      label: "جدولة بوقت محدد",
      description: "حدد وقت بداية أو نهاية لظهور الإعلان.",
      icon: (
        <svg className="oh-ad-reschedule-card__icon" width="22" height="22" viewBox="0 0 24 24" aria-hidden>
          <path
            fill="currentColor"
            d="M19 4h-1V2h-2v2H8V2H6v2H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V6c0-1.1-.9-2-2-2zm0 16H5V10h14v10zm0-12H5V6h14v2z"
          />
        </svg>
      ),
    },
    {
      id: "off",
      label: "إيقاف الإعلان",
      description: "يتم إخفاء الإعلان عن المستخدمين حتى تقوم بتشغيله مرة أخرى.",
      icon: (
        <svg className="oh-ad-reschedule-card__icon" width="22" height="22" viewBox="0 0 24 24" aria-hidden>
          <path fill="currentColor" d="M8 8h8v8H8z" />
        </svg>
      ),
    },
  ];

  return (
    <div
      className="oh-admin-ads__modal oh-admin-ads__modal--stack"
      role="dialog"
      aria-modal="true"
      aria-labelledby="ad-reschedule-title"
      aria-describedby="ad-reschedule-desc"
    >
      <div className="oh-admin-ads__modal-card oh-admin-ads__modal-card--reschedule">
        <header className="oh-ad-reschedule__header">
          <h2 id="ad-reschedule-title" className="oh-ad-reschedule__title">
            إدارة ظهور الإعلان
          </h2>
          <p id="ad-reschedule-desc" className="oh-ad-reschedule__subtitle">
            اختر طريقة ظهور الإعلان للمستخدمين، ويمكنك تعديل الجدولة في أي وقت.
          </p>

          <div className="oh-ad-reschedule__badges" aria-live="polite">
            <span className="oh-ad-reschedule__badge">
              <span className="oh-ad-reschedule__badge-label">الإعلان:</span>{" "}
              <span className="oh-ad-reschedule__badge-value">{adTitle}</span>
            </span>
            <span className="oh-ad-reschedule__badge">
              <span className="oh-ad-reschedule__badge-label">الحالة الحالية:</span>{" "}
              <span className="oh-ad-reschedule__badge-status">{statusLabel}</span>
            </span>
          </div>
        </header>

        <div className="oh-ad-reschedule__body">
          <h3 className="oh-ad-reschedule__section-title">كيف تريد عرض الإعلان؟</h3>

          <div className="oh-ad-reschedule__cards" role="group" aria-label="خيارات ظهور الإعلان">
            {cards.map((c) => {
              const selected = mode === c.id;
              return (
                <button
                  key={c.id}
                  type="button"
                  className={`oh-ad-reschedule-card${selected ? " oh-ad-reschedule-card--selected" : ""}`}
                  aria-pressed={selected}
                  disabled={saving}
                  onClick={() => selectMode(c.id)}
                >
                  <span className="oh-ad-reschedule-card__top">
                    {c.icon}
                    <span className="oh-ad-reschedule-card__label">{c.label}</span>
                    {selected ? (
                      <span className="oh-ad-reschedule-card__picked">
                        <span className="oh-ad-reschedule-card__check" aria-hidden>
                          ✓
                        </span>
                        محدد
                      </span>
                    ) : (
                      <span className="oh-ad-reschedule-card__picked oh-ad-reschedule-card__picked--placeholder" aria-hidden>
                        &nbsp;
                      </span>
                    )}
                  </span>
                  <span className="oh-ad-reschedule-card__desc">{c.description}</span>
                </button>
              );
            })}
          </div>

          {mode === "schedule" ? (
            <div className="oh-ad-reschedule__schedule-block">
              <div className="oh-ad-reschedule__quick-dates" dir="rtl">
                <span className="oh-ad-reschedule__quick-label">اختصارات:</span>
                <div className="oh-ad-reschedule__quick-row" role="group" aria-label="اختصارات التاريخ">
                  <button type="button" className="btn btn-secondary oh-ad-reschedule__chip" disabled={saving} onClick={setStartToday}>
                    اليوم
                  </button>
                  <button type="button" className="btn btn-secondary oh-ad-reschedule__chip" disabled={saving} onClick={setStartTomorrow}>
                    غدًا
                  </button>
                  <button type="button" className="btn btn-secondary oh-ad-reschedule__chip" disabled={saving} onClick={setStartNextWeek}>
                    بعد أسبوع
                  </button>
                  <button type="button" className="btn btn-secondary oh-ad-reschedule__chip" disabled={saving} onClick={clearEnd}>
                    بدون نهاية
                  </button>
                </div>
              </div>

              <div className="oh-admin-ads__field oh-ad-reschedule__field">
                <label htmlFor="ad-reschedule-start">بداية الظهور</label>
                <input
                  id="ad-reschedule-start"
                  type="datetime-local"
                  dir="ltr"
                  value={startDate}
                  onChange={(e) => setStartDate(e.target.value)}
                  disabled={saving}
                />
                <p className="oh-ad-reschedule__hint">يمكنك ترك بداية الظهور فارغة ليبدأ الإعلان فورًا.</p>
              </div>
              <div className="oh-admin-ads__field oh-ad-reschedule__field">
                <label htmlFor="ad-reschedule-end">نهاية الظهور</label>
                <input
                  id="ad-reschedule-end"
                  type="datetime-local"
                  dir="ltr"
                  value={endDate}
                  onChange={(e) => setEndDate(e.target.value)}
                  disabled={saving}
                />
                <p className="oh-ad-reschedule__hint">يمكنك ترك نهاية الظهور فارغة ليبقى الإعلان بدون نهاية.</p>
              </div>

              {scheduleInvalid ? (
                <p className="oh-ad-reschedule__error" role="alert">
                  تاريخ النهاية لا يمكن أن يكون قبل تاريخ البداية.
                </p>
              ) : null}
              {endInPastWarning && !scheduleInvalid ? (
                <p className="oh-ad-reschedule__warn" role="status">
                  تنبيه: تاريخ النهاية في الماضي، لذلك سيظهر الإعلان كمنتهي ولن يظهر للمستخدمين.
                </p>
              ) : null}
            </div>
          ) : null}

          <div className="oh-ad-reschedule__summary" aria-live="polite">
            <span className="oh-ad-reschedule__summary-label">ملخص</span>
            <p className="oh-ad-reschedule__summary-text">{summaryText}</p>
          </div>

          <div className="oh-ad-reschedule__actions">
            <button type="button" className="btn btn-secondary" disabled={saving} onClick={onClose}>
              إلغاء
            </button>
            <button
              type="button"
              className="btn btn-primary"
              disabled={saving || scheduleInvalid}
              onClick={() => void handleSave()}
            >
              {saving ? "جارٍ الحفظ..." : "حفظ التغييرات"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
