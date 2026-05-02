import AuthVisualPanel from "./AuthVisualPanel";
import * as tw from "./authTw";

const AuthLayout = ({ children, visualContent }) => {
  return (
    <main className={tw.authPage}>
      <section className={`${tw.authCardShell} mx-auto`}>
        <div className={tw.authCard}>
          <AuthVisualPanel {...visualContent} />
          {children}
        </div>
      </section>
    </main>
  );
};

export default AuthLayout;
