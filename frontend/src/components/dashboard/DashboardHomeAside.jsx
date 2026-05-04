/**
 * Sidebar summary for client / freelancer dashboard home (RTL-friendly).
 */
export default function DashboardHomeAside({ variant, userInitials, profilePct, client, freelancer }) {
  const pct = Number.isFinite(Number(profilePct)) ? Math.min(100, Math.max(0, Math.round(Number(profilePct)))) : 0;

  return (
    <aside className="dash-aside" aria-label="ملخص سريع">
      <div className="dash-aside__profile">
        <div className="dash-aside__avatar-ring" style={{ "--pct": pct }}>
          <div className="dash-aside__avatar">{userInitials}</div>
        </div>
        <p className="dash-aside__pct-label">{pct}%</p>
        <div className="dash-aside__profile-copy">
          <p className="dash-aside__profile-label">إكمال النشاط</p>
          <p className="dash-aside__profile-hint">
            {variant === "client" ? "بناءً على نسبة الطلبات المكتملة." : "مؤشر سريع لنشاطك على المنصة."}
          </p>
        </div>
      </div>

      {variant === "client" && client ? (
        <div className="dash-aside__block">
          <h3 className="dash-aside__block-title">أرقام اليوم</h3>
          <ul className="dash-aside__stats">
            <li className="dash-aside__stat">
              <span className="dash-aside__stat-icon dash-aside__stat-icon--indigo" aria-hidden="true" />
              <div>
                <span className="dash-aside__stat-label">إجمالي الطلبات</span>
                <span className="dash-aside__stat-value">{client.orderTotal}</span>
              </div>
            </li>
            <li className="dash-aside__stat">
              <span className="dash-aside__stat-icon dash-aside__stat-icon--violet" aria-hidden="true" />
              <div>
                <span className="dash-aside__stat-label">بانتظار الدفع</span>
                <span className="dash-aside__stat-value">{client.pendingPayment}</span>
              </div>
            </li>
            <li className="dash-aside__stat">
              <span className="dash-aside__stat-icon dash-aside__stat-icon--pink" aria-hidden="true" />
              <div>
                <span className="dash-aside__stat-label">إجمالي المدفوع</span>
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
          <h3 className="dash-aside__block-title">حالة العمل</h3>
          <ul className="dash-aside__stats">
            <li className="dash-aside__stat">
              <span className="dash-aside__stat-icon dash-aside__stat-icon--indigo" aria-hidden="true" />
              <div>
                <span className="dash-aside__stat-label">الاشتراك</span>
                <span className="dash-aside__stat-value dash-aside__stat-value--sm">{freelancer.subscriptionLabel}</span>
              </div>
            </li>
            <li className="dash-aside__stat">
              <span className="dash-aside__stat-icon dash-aside__stat-icon--violet" aria-hidden="true" />
              <div>
                <span className="dash-aside__stat-label">فرص المعرض (عرض)</span>
                <span className="dash-aside__stat-value">{freelancer.poolCount}</span>
              </div>
            </li>
            <li className="dash-aside__stat">
              <span className="dash-aside__stat-icon dash-aside__stat-icon--sky" aria-hidden="true" />
              <div>
                <span className="dash-aside__stat-label">طلبات مسندة</span>
                <span className="dash-aside__stat-value">{freelancer.assignedCount}</span>
              </div>
            </li>
            <li className="dash-aside__stat">
              <span className="dash-aside__stat-icon dash-aside__stat-icon--pink" aria-hidden="true" />
              <div>
                <span className="dash-aside__stat-label">مطالبات قيد المراجعة</span>
                <span className="dash-aside__stat-value">{freelancer.claimsPending}</span>
              </div>
            </li>
          </ul>
        </div>
      ) : null}

      <div className="dash-aside__spark-wrap">
        <p className="dash-aside__spark-title">نشاط أسبوعي</p>
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
