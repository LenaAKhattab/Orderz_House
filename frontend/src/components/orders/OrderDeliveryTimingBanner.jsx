import { useMemo } from "react";
import { getOrderDeliveryTiming } from "../../utils/orderDeliveryTiming";

/**
 * One shared UI for delivery vs deadline (all roles, same copy).
 * Renders nothing if there is no submission timestamp or no deadline.
 */
export default function OrderDeliveryTimingBanner({ order, className = "" }) {
  const timing = useMemo(() => getOrderDeliveryTiming(order), [order]);

  if (!timing) return null;

  const rootClass =
    timing.status === "late"
      ? "oh-delivery-timing oh-delivery-timing--late"
      : "oh-delivery-timing oh-delivery-timing--on_time";

  const icon = timing.status === "late" ? "⚠" : "✓";

  return (
    <div className={`${rootClass}${className ? ` ${className}` : ""}`.trim()} role="status" dir="rtl">
      <span className="oh-delivery-timing__icon" aria-hidden="true">
        {icon}
      </span>
      <div className="oh-delivery-timing__copy">
        <p className="oh-delivery-timing__text">{timing.message}</p>
        {timing.completionMessage ? <p className="oh-delivery-timing__sub">{timing.completionMessage}</p> : null}
      </div>
    </div>
  );
}
