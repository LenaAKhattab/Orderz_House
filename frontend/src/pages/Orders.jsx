import OpenOrdersMarketplace from "../components/open-orders/OpenOrdersMarketplace";
import { useTranslation } from "../i18n/LanguageProvider";

/**
 * Public معرض الطلبات — same neumorphic marketplace UI as `/dashboard/freelancer/orders`.
 * API uses `GET /orders/pool` with guest/public sanitization; actions require auth + role (see OpenOrdersMarketplace).
 */
const Orders = () => {
  const { dir, locale } = useTranslation();

  return (
    <main className="oh-orders-public-page" lang={locale} dir={dir}>
      <OpenOrdersMarketplace layout="public" />
    </main>
  );
};

export default Orders;
