import AuthVisualPanel from "./AuthVisualPanel";
import "./auth-pages.css";

const AuthLayout = ({ children, visualContent }) => {
  return (
    <main className="oh-auth-page">
      <section className="oh-auth-shell">
        <div className="oh-auth-card">
          <AuthVisualPanel {...visualContent} />
          {children}
        </div>
      </section>
    </main>
  );
};

export default AuthLayout;
