import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { listClientMyOrdersRequest } from "../../services/api";
import { isClientFixedOrderAwaitingStripeCheckout } from "../../utils/clientFixedOrderPayNow";
import { useTranslation } from "../../i18n/LanguageProvider";
import { usePageRestore } from "../../hooks/usePageRestore";
import ClientFixedOrderPayNowButton from "./ClientFixedOrderPayNowButton";
import "../../i18n/clientAreaResources";

const RECENT_MS = 7 * 24 * 60 * 60 * 1000;

/** Recent unpaid fixed-price orders (null when the list cannot be loaded — the hint is optional). */
async function fetchRecentPendingPaymentOrders() {
  try {
    const res = await listClientMyOrdersRequest({ limit: 50, offset: 0 });
    const list = res?.data?.orders ?? res?.orders;
    const now = Date.now();
    return (Array.isArray(list) ? list : [])
      .filter((o) => isClientFixedOrderAwaitingStripeCheckout(o))
      .filter((o) => !o.createdAt || now - new Date(o.createdAt).getTime() < RECENT_MS)
      .slice(0, 2);
  } catch {
    return null;
  }
}

/**
 * Create Order: an unpaid fixed-price order already exists (e.g. after leaving Stripe Checkout) →
 * offer «Continue payment» on that SAME order instead of silently starting a duplicate.
 * Refetched on open and when the page is restored from the back-forward cache.
 */
export default function ClientPendingPaymentNotice() {
  const { t } = useTranslation();
  const n = "clientArea.pendingPaymentNotice";
  const [orders, setOrders] = useState([]);

  const load = useCallback(async () => {
    const pending = await fetchRecentPendingPaymentOrders();
    if (pending) setOrders(pending);
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const pending = await fetchRecentPendingPaymentOrders();
      if (!cancelled && pending) setOrders(pending);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  usePageRestore((reason) => {
    if (reason === "pageshow") void load();
  });

  if (!orders.length) return null;

  return (
    <section className="oh-pending-payment-notice" role="status" data-testid="pending-payment-notice">
      <p className="oh-pending-payment-notice__title">{t(`${n}.title`)}</p>
      <p className="oh-pending-payment-notice__text">{t(`${n}.text`)}</p>
      <ul className="oh-pending-payment-notice__list">
        {orders.map((o) => (
          <li key={o.id} className="oh-pending-payment-notice__item" data-order-id={String(o.id)}>
            <span className="oh-pending-payment-notice__order" dir="auto">
              {o.title}
            </span>
            <ClientFixedOrderPayNowButton order={o} className="btn btn-primary btn-sm" onChanged={load} />
          </li>
        ))}
      </ul>
      <Link className="oh-pending-payment-notice__link" to="/dashboard/client/my-orders">
        {t(`${n}.viewOrders`)}
      </Link>
    </section>
  );
}
