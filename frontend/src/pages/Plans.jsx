import { useEffect, useMemo, useState } from "react";
import { getMySubscriptionRequest, listPublicPlansRequest } from "../services/api";
import PricingSection from "../components/plans/PricingSection";
import { useAuth } from "../context/useAuth";

function errorMessage(err) {
  const apiMsg = err?.response?.data?.message;
  return apiMsg || "تعذر تحميل الباقات حالياً. حاول لاحقاً.";
}

function isBlockingSubscription(subscription) {
  if (!subscription) return false;
  const status = subscription?.status;
  if (status === "inactive" || status === "cancelled") return false;

  const expiry = subscription?.expiryDate ? new Date(subscription.expiryDate) : null;
  if (expiry && Number.isFinite(expiry.getTime())) {
    return expiry.getTime() > Date.now();
  }
  // If there's no valid expiry date but it's still not inactive/cancelled,
  // treat it as blocking to avoid re-subscribing.
  return status === "active" || status === "assigned_not_started";
}

const Plans = () => {
  const { user } = useAuth();
  const [plans, setPlans] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [mySubscription, setMySubscription] = useState(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError("");
      try {
        const data = await listPublicPlansRequest();
        const items = data?.data?.plans || [];
        if (!cancelled) setPlans(items);
      } catch (err) {
        if (!cancelled) setError(errorMessage(err));
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const role = user?.primaryRole || user?.role;
      const roles = Array.isArray(user?.roles) ? user.roles : [];
      const isFreelancer = role === "freelancer" || roles.includes("freelancer");
      if (!user || !isFreelancer) {
        setMySubscription(null);
        return;
      }
      try {
        const res = await getMySubscriptionRequest();
        if (!cancelled) setMySubscription(res?.data?.subscription || null);
      } catch {
        if (!cancelled) setMySubscription(null);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [user]);

  const hasBlockingSubscription = useMemo(() => isBlockingSubscription(mySubscription), [mySubscription]);

  return (
    <main className="container page-content">
      <PricingSection
        loading={loading}
        plans={plans.filter((p) => p?.isVisible !== false)}
        hasBlockingSubscription={hasBlockingSubscription}
        onCta={() => {
          // Placeholder: wire to subscribe flow later
        }}
      />
      {error ? (
        <section className="card" style={{ marginTop: 14 }}>
          <p className="auth-form-error">{error}</p>
        </section>
      ) : null}

      {!loading && plans.length === 0 ? (
        <section className="card" style={{ marginTop: 14 }}>
          <p>لا توجد باقات متاحة حالياً.</p>
        </section>
      ) : null}
    </main>
  );
};

export default Plans;

