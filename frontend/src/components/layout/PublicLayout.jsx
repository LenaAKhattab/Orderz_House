import { Outlet, useLocation } from "react-router-dom";
import PartnersSection from "../sections/PartnersSection";
import Navbar from "./Navbar";
import Footer from "./Footer";

const PublicLayout = () => {
  const { pathname } = useLocation();
  const isAuthPage = ["/login", "/register", "/forgot-password"].includes(pathname);
  const isHome = pathname === "/";

  return (
    <div className={`page-shell${isHome ? " page-shell--home-flow" : ""}`}>
      <Navbar />
      <Outlet />
      {!isAuthPage ? <PartnersSection /> : null}
      {!isAuthPage ? <Footer /> : null}
    </div>
  );
};

export default PublicLayout;
