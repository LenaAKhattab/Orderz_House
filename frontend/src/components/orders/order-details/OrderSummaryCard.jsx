import OrderDetailsNeuIcon from "./OrderDetailsNeuIcon";

/**
 * Compact summary (Stripe-style): optional primary block + label / value rows.
 * @param {{ label: string, value: string, dir?: string, icon?: string }[]} props.rows
 * @param {{ label: string, value: string, dir?: string, icon?: string }} [props.primaryBlock]
 * @param {string} [props.title]
 */
export default function OrderSummaryCard({ title = "ملخص الطلب", primaryBlock, rows = [] }) {
  return (
    <div className="od-summary od-summary--card" aria-label={title}>
      <div className="od-summary__surface">
        <h2 className="od-summary__title">{title}</h2>
        {primaryBlock ? (
          <div className="od-summary__primary">
            <div className="od-summary__row-line">
              {primaryBlock.icon ? <OrderDetailsNeuIcon name={primaryBlock.icon} /> : null}
              <div className="od-summary__row-copy">
                <div className="od-summary__label">{primaryBlock.label}</div>
                <div
                  className="od-summary__primary-value"
                  dir={primaryBlock.dir || "rtl"}
                  style={primaryBlock.dir ? { unicodeBidi: "plaintext" } : undefined}
                >
                  {primaryBlock.value || "—"}
                </div>
              </div>
            </div>
          </div>
        ) : null}
        {rows.length ? (
          <dl className="od-summary__list">
            {rows.map((r) => (
              <div key={r.label} className="od-summary__row">
                <div className="od-summary__row-line">
                  {r.icon ? <OrderDetailsNeuIcon name={r.icon} /> : null}
                  <div className="od-summary__row-copy">
                    <dt className="od-summary__label">{r.label}</dt>
                    <dd
                      className="od-summary__value"
                      dir={r.dir || "rtl"}
                      style={r.dir ? { unicodeBidi: "plaintext" } : undefined}
                    >
                      {r.value || "—"}
                    </dd>
                  </div>
                </div>
              </div>
            ))}
          </dl>
        ) : null}
      </div>
    </div>
  );
}
