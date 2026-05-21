export default function DashboardHubHero({ badge, title, subtitle, art }) {
  return (
    <header className="fdash-hero">
      <div className="fdash-hero__glow fdash-hero__glow--a" aria-hidden />
      <div className="fdash-hero__glow fdash-hero__glow--b" aria-hidden />
      {art ? (
        <div className="fdash-hero__art" aria-hidden>
          {art}
        </div>
      ) : null}
      <div className="fdash-hero__copy">
        {badge ? <span className="fdash-hero__badge">{badge}</span> : null}
        <h1 className="fdash-hero__title">{title}</h1>
        {subtitle ? <p className="fdash-hero__subtitle">{subtitle}</p> : null}
      </div>
    </header>
  );
}
