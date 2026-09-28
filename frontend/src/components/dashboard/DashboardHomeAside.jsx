import { useTranslation } from "../../i18n/LanguageProvider";

/**
 * Sidebar summary for client / freelancer dashboard home (RTL-friendly).
 */
export default function DashboardHomeAside({ variant, userInitials, profilePct, client, freelancer }) {
  const { t } = useTranslation();
  const ha = "dashboard.homeAside";
  const pct = Number.isFinite(Number(profilePct)) ? Math.min(100, Math.max(0, Math.round(Number(profilePct)))) : 0;

  return (
    <aside className="dash-aside" aria-label={t(`${ha}.aria`)}>
      <div className="dash-aside__profile">
        <div className="dash-aside__avatar-ring" style={{ "--pct": pct }}>
          <div className="dash-aside__avatar">{userInitials}</div>
        </div>
        <p className="dash-aside__pct-label">{pct}%</p>
        <div className="dash-aside__profile-copy">
          <p className="dash-aside__profile-label">{t(`${ha}.activityCompletion`)}</p>
          <p className="dash-aside__profile-hint">
            {variant === "client" ? t(`${ha}.clientHint`) : t(`${ha}.freelancerHint`)}
          </p>
        </div>
      </div>

      {variant === "client" && client ? (
        <div className="dash-aside__block">
          <h3 className="dash-aside__block-title">{t(`${ha}.todayNumbers`)}</h3>
          <ul className="dash-aside__stats">
            <li className="dash-aside__stat">
              <span className="dash-aside__stat-icon dash-aside__stat-icon--indigo" aria-hidden="true" />
              <div>
                <span className="dash-aside__stat-label">{t(`${ha}.totalOrders`)}</span>
                <span className="dash-aside__stat-value">{client.orderTotal}</span>
              </div>
            </li>
            <li className="dash-aside__stat">
              <span className="dash-aside__stat-icon dash-aside__stat-icon--violet" aria-hidden="true" />
              <div>
                <span className="dash-aside__stat-label">{t(`${ha}.pendingPayment`)}</span>
                <span className="dash-aside__stat-value">{client.pendingPayment}</span>
              </div>
            </li>
            <li className="dash-aside__stat">
              <span className="dash-aside__stat-icon dash-aside__stat-icon--pink" aria-hidden="true" />
              <div>
                <span className="dash-aside__stat-label">{t(`${ha}.totalPaid`)}</span>
                <span className="dash-aside__stat-value" dir="ltr">
                  {client.totalPaidFormatted}
                </span>
              </div>
            </li>
          </ul>
        </div>
      ) : null}

      {variant === "freelancer" && freelancer ? (
        <div className="dash-aside__block">
          <h3 className="dash-aside__block-title">{t(`${ha}.workStatus`)}</h3>
          <ul className="dash-aside__stats">
            <li className="dash-aside__stat">
              <span className="dash-aside__stat-icon dash-aside__stat-icon--indigo" aria-hidden="true" />
              <div>
                <span className="dash-aside__stat-label">{t(`${ha}.subscription`)}</span>
                <span className="dash-aside__stat-value dash-aside__stat-value--sm">{freelancer.subscriptionLabel}</span>
              </div>
            </li>
            <li className="dash-aside__stat">
              <span className="dash-aside__stat-icon dash-aside__stat-icon--violet" aria-hidden="true" />
              <div>
                <span className="dash-aside__stat-label">{t(`${ha}.poolPreview`)}</span>
                <span className="dash-aside__stat-value">{freelancer.poolCount}</span>
              </div>
            </li>
            <li className="dash-aside__stat">
              <span className="dash-aside__stat-icon dash-aside__stat-icon--sky" aria-hidden="true" />
              <div>
                <span className="dash-aside__stat-label">{t(`${ha}.assignedOrders`)}</span>
                <span className="dash-aside__stat-value">{freelancer.assignedCount}</span>
              </div>
            </li>
            <li className="dash-aside__stat">
              <span className="dash-aside__stat-icon dash-aside__stat-icon--pink" aria-hidden="true" />
              <div>
                <span className="dash-aside__stat-label">{t(`${ha}.claimsPending`)}</span>
                <span className="dash-aside__stat-value">{freelancer.claimsPending}</span>
              </div>
            </li>
          </ul>
        </div>
      ) : null}

      <div className="dash-aside__spark-wrap">
        <p className="dash-aside__spark-title">{t(`${ha}.weeklyActivity`)}</p>
        <div className="dash-spark" role="img" aria-hidden="true">
          <span className="dash-spark__bar" style={{ "--h": "42%" }} />
          <span className="dash-spark__bar dash-spark__bar--mid" style={{ "--h": "68%" }} />
          <span className="dash-spark__bar dash-spark__bar--hi" style={{ "--h": "88%" }} />
          <span className="dash-spark__bar" style={{ "--h": "55%" }} />
          <span className="dash-spark__bar dash-spark__bar--mid" style={{ "--h": "72%" }} />
          <span className="dash-spark__bar" style={{ "--h": "38%" }} />
          <span className="dash-spark__bar dash-spark__bar--hi" style={{ "--h": "92%" }} />
        </div>
      </div>
    </aside>
  );
}
