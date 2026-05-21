import { Link } from "react-router-dom";

export default function DashboardButton({
  to,
  href,
  onClick,
  variant = "primary",
  icon: Icon,
  iconEnd = false,
  children,
  className = "",
  type = "button",
  ...rest
}) {
  const cls = `fdash-btn fdash-btn--${variant} ${className}`.trim();
  const content = (
    <>
      {Icon && !iconEnd ? (
        <span className="fdash-btn__icon" aria-hidden>
          <Icon />
        </span>
      ) : null}
      <span className="fdash-btn__label">{children}</span>
      {Icon && iconEnd ? (
        <span className="fdash-btn__icon fdash-btn__icon--end" aria-hidden>
          <Icon />
        </span>
      ) : null}
    </>
  );

  if (to) {
    return (
      <Link to={to} className={cls} {...rest}>
        {content}
      </Link>
    );
  }

  if (href) {
    return (
      <a href={href} className={cls} {...rest}>
        {content}
      </a>
    );
  }

  return (
    <button type={type} className={cls} onClick={onClick} {...rest}>
      {content}
    </button>
  );
}
