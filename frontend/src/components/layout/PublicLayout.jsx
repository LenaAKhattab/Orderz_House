import { Outlet, useLocation } from "react-router-dom";
import PartnersSection from "../sections/PartnersSection";
import Navbar from "./Navbar";
import Footer from "./Footer";

const PublicLayout = () => {
  const { pathname } = useLocation();
  const isAuthPage = ["/login", "/register", "/forgot-password"].includes(pathname);
  const isHome = pathname === "/";

  return (
    <div
      className={
        isHome
          ? "flex min-h-screen flex-col bg-white bg-[radial-gradient(120%_85%_at_50%_-25%,rgba(47,59,101,0.07),transparent_55%),radial-gradient(85%_55%_at_95%_32%,rgba(118,207,223,0.07),transparent_52%),radial-gradient(75%_45%_at_5%_58%,rgba(118,207,223,0.05),transparent_50%)]"
          : "flex min-h-screen flex-col"
      }
    >
      <Navbar />
      <Outlet />
      {isHome ? <PartnersSection /> : null}
      {!isAuthPage ? <Footer homeBlend={isHome} /> : null}
    </div>
  );
};

export default PublicLayout;
