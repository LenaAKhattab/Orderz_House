const Button = ({ children, type = "button", variant = "primary", className = "", ...props }) => {
  const classes = `btn btn-${variant} ${className}`.trim();

  return (
    <button type={type} className={classes} {...props}>
      {children}
    </button>
  );
};

export default Button;
