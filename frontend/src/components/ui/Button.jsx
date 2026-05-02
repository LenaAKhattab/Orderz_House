const Button = ({ children, type = "button", variant = "primary", className = "", unstyled = false, ...props }) => {
  const classes = unstyled ? className.trim() : `btn btn-${variant} ${className}`.trim();

  return (
    <button type={type} className={classes} {...props}>
      {children}
    </button>
  );
};

export default Button;
