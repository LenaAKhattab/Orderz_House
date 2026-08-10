import { useEffect, useState } from "react";
import { getFreelancerWorkTokenWalletRequest } from "../../services/api";
import { useTranslation } from "../../i18n/LanguageProvider";

/**
 * Read-only Work Token wallet card (Phase 4).
 * No buy / reserve / spend / bid actions — engine remains OFF.
 */
export default function FreelancerWorkTokenWalletCard() {
  const { t } = useTranslation();
  const [state, setState] = useState({ loading: true, error: null, data: null });

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await getFreelancerWorkTokenWalletRequest();
        if (!cancelled) {
          setState({ loading: false, error: null, data: res?.data || null });
        }
      } catch (err) {
        if (!cancelled) {
          setState({
            loading: false,
            error: err?.response?.data?.message || err?.message || "error",
            data: null,
          });
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  if (state.loading) {
    return (
      <section className="fp-surface" style={{ marginTop: 16 }} aria-busy="true">
        <p style={{ margin: 0 }}>{t("freelancerDashboard.workTokenWallet.loading")}</p>
      </section>
    );
  }

  if (state.error) {
    return null;
  }

  const snap = state.data || {
    availableTokens: 0,
    reservedTokens: 0,
    engineAvailable: false,
  };

  return (
    <section className="fp-surface" style={{ marginTop: 16 }}>
      <h2 style={{ margin: "0 0 8px", fontSize: "1.05rem" }}>
        {t("freelancerDashboard.workTokenWallet.title")}
      </h2>
      <p style={{ margin: "0 0 12px", opacity: 0.85, fontSize: "0.92rem" }}>
        {t("freelancerDashboard.workTokenWallet.subtitle")}
      </p>
      <dl
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))",
          gap: 12,
          margin: 0,
        }}
      >
        <div>
          <dt style={{ opacity: 0.75, fontSize: "0.85rem" }}>
            {t("freelancerDashboard.workTokenWallet.available")}
          </dt>
          <dd style={{ margin: "4px 0 0", fontWeight: 600 }}>{snap.availableTokens ?? 0}</dd>
        </div>
        <div>
          <dt style={{ opacity: 0.75, fontSize: "0.85rem" }}>
            {t("freelancerDashboard.workTokenWallet.reserved")}
          </dt>
          <dd style={{ margin: "4px 0 0", fontWeight: 600 }}>{snap.reservedTokens ?? 0}</dd>
        </div>
      </dl>
      <p style={{ margin: "12px 0 0", fontSize: "0.88rem", opacity: 0.8 }}>
        {snap.engineAvailable
          ? t("freelancerDashboard.workTokenWallet.engineOn")
          : t("freelancerDashboard.workTokenWallet.engineComingSoon")}
      </p>
    </section>
  );
}
