import fs from "fs";

const p = "src/pages/dashboard/FreelancerDashboardHome.jsx";
let s = fs.readFileSync(p, "utf8");

const marker = "  if (error && assignedOrders.length === 0) {";
const start = s.indexOf(marker);
if (start < 0) throw new Error("marker not found");

const head = s.slice(0, start);

const tail = `  if (error && assignedOrders.length === 0) {
    return (
      <DashboardHubPage>
        <DashboardHubHero title="تعذر التحميل" subtitle={error} />
        <div className="fdash-alert">
          <p style={{ margin: 0 }}>{error}</p>
          <button type="button" className="fdash-toolbar__btn" onClick={() => void load()}>
            إعادة المحاولة
          </button>
        </div>
      </DashboardHubPage>
    );
  }

  return (
    <DashboardHubPage>
      <DashboardHubHero
        badge={welcomeName ? <>مرحباً {welcomeName}</> : "لوحة المستقل"}
        title="رحلتك المهنية تبدأ من هنا"
        subtitle="أدر طلباتك، طوّر مهاراتك، وابنِ سمعتك المهنية — كل شيء في مكان واحد منظم."
        art={
          <>
            <span className="fdash-hero__glyph fdash-hero__glyph--a">🚀</span>
            <span className="fdash-hero__glyph fdash-hero__glyph--b">💼</span>
          </>
        }
      />
      <DashboardHubStats items={statsItems} columns={5} ariaLabel="ملخص الطلبات" />
      {!subBusy ? (
        <motionless className="fdash-promo">
          <h3 className="fdash-promo__title">{subscriptionDisplayStatus(subscription)}</h3>
          <p className="fdash-promo__sub">
            {isFreelancerEligible
              ? "يمكنك التقديم على الطلبات المتاحة وفق شروط المنصة."
              : ineligibleMessage || "لا يمكنك استلام طلبات من المعرض حالياً."}
            {subscriptionStateHint(subscription) ? \` \${subscriptionStateHint(subscription)}\` : ""}
          </p>
          {!subscription ? (
            <Link to="/plans" className="fdash-empty__btn">
              اختيار باقة
            </Link>
          ) : null}
        </motionless>
      ) : null}
      <DashboardHubSection title="إجراءات سريعة" id="fdash-quick-heading">
        <DashboardHubQuickActions items={quickActions} />
      </DashboardHubSection>
      <DashboardHubSection
        title="أحدث الطلبات"
        actionLabel="عرض الكل"
        actionTo="/dashboard/freelancer/my-orders"
        id="fdash-recent-orders"
      >
        {recentAssigned.length === 0 ? (
          <DashboardHubEmpty
            icon="📭"
            title="لا توجد طلبات مسندة بعد"
            subtitle="استعرض الطلبات المتاحة وقدّم عروضك لبدء العمل."
            actionLabel="الطلبات المتاحة"
            actionTo="/dashboard/freelancer/orders"
          />
        ) : (
          <div className="fdash-list__grid">
            {recentAssigned.map((o) => (
              <MyOrderCard key={o.id} order={o} />
            ))}
          </div>
        )}
      </DashboardHubSection>
    </DashboardHubPage>
  );
}
`.replace(/motionless/g, "div");

fs.writeFileSync(p, head + tail, "utf8");
console.log("patched");
