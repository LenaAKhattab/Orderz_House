export default function DashboardMetricItem({ label, value, sublabel, icon: Icon, tone = "blue", inline = false }) {
  return (
    <div className={`fdash-metric fdash-metric--${tone}${inline ? " fdash-metric--inline" : ""}`}>
      {Icon ? (
        <span className="fdash-metric__icon" aria-hidden>
          <Icon />
        </span>
      ) : null}
      <div className="fdash-metric__body">
        <span className="fdash-metric__label">{label}</span>
        <strong className="fdash-metric__value">{value}</strong>
        {sublabel ? <span className="fdash-metric__sub">{sublabel}</span> : null}
      </div>
    </div>
  );
}
