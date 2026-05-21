export default function DashboardHubListHead({ title, countLabel, id }) {
  return (
    <div className="fdash-list__head">
      <h2 id={id} className="fdash-list__title">
        {title}
      </h2>
      {countLabel ? <span className="fdash-list__count">{countLabel}</span> : null}
    </div>
  );
}
