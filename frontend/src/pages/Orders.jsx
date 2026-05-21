import OpenOrdersMarketplace from "../components/open-orders/OpenOrdersMarketplace";

/**
 * Public معرض الطلبات — same neumorphic marketplace UI as `/dashboard/freelancer/orders`.
 * API uses `GET /orders/pool` with guest/public sanitization; actions require auth + role (see OpenOrdersMarketplace).
 */
const Orders = () => (
  <main className="oh-orders-public-page">
    <OpenOrdersMarketplace layout="public" />
  </main>
);

export default Orders;
