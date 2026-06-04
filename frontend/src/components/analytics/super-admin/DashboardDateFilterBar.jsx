import { useState } from "react";

import { PERIOD_PRESETS } from "./dashboardDateRange";



export default function DashboardDateFilterBar({ period, onChange, disabled = false }) {

  const [showCustom, setShowCustom] = useState(period?.preset === "custom");



  const handlePreset = (id) => {

    if (id === "custom") {

      setShowCustom(true);

      onChange({ preset: "custom", customFrom: period?.customFrom, customTo: period?.customTo });

      return;

    }

    setShowCustom(false);

    onChange({ preset: id });

  };



  return (

    <div className="sa-date-filter sa-date-filter--control" dir="rtl" role="group" aria-label="فلتر الفترة الزمنية">

      <div className="sa-date-filter__row">

        <div className="sa-date-filter__head">

          <p className="sa-date-filter__module-title m-0">فلتر الفترة</p>

          <p className="sa-date-filter__module-desc m-0">نطاق الاتجاهات والمقارنات</p>

        </div>

        <p className="sa-date-filter__current m-0" role="status">

          <span className="sa-date-filter__current-label">الفترة:</span> <strong>{period?.label}</strong>

          {period?.posthogLimited ? <span className="sa-date-filter__note"> (نشاط: 30 يوماً)</span> : null}

        </p>

      </div>

      <div className="sa-date-filter__controls">

        <div className="sa-date-filter__presets">

          {PERIOD_PRESETS.map((p) => (

            <button

              key={p.id}

              type="button"

              className={`sa-date-filter__btn${period?.preset === p.id ? " sa-date-filter__btn--active" : ""}`}

              disabled={disabled}

              onClick={() => handlePreset(p.id)}

            >

              {p.label}

            </button>

          ))}

        </div>

        {showCustom || period?.preset === "custom" ? (

          <div className="sa-date-filter__custom">

            <label className="sa-date-filter__field">

              <span>من</span>

              <input

                type="date"

                dir="ltr"

                value={period?.customFrom || ""}

                disabled={disabled}

                onChange={(e) => onChange({ preset: "custom", customFrom: e.target.value, customTo: period?.customTo })}

              />

            </label>

            <label className="sa-date-filter__field">

              <span>إلى</span>

              <input

                type="date"

                dir="ltr"

                value={period?.customTo || ""}

                disabled={disabled}

                onChange={(e) => onChange({ preset: "custom", customFrom: period?.customFrom, customTo: e.target.value })}

              />

            </label>

          </div>

        ) : null}

      </div>

    </div>

  );

}

