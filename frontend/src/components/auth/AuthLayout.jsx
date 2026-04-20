import AuthVisualPanel from "./AuthVisualPanel";

const AuthLayout = ({ children, visualContent }) => {
  return (
    <main className="auth-page">
      <section className="container auth-card-shell">
        <div className="auth-card">
          <AuthVisualPanel {...visualContent} />
          {children}
        </div>
      </section>
    </main>
  );
};

export default AuthLayout;
