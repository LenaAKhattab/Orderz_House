import { Outlet, useLocation } from "react-router-dom";
import { HomePageBlockingProvider, useHomePageBlocking } from "../../context/HomePageBlockingContext";
import PartnersBandSkeleton from "../skeletons/PartnersBandSkeleton";
import PartnersSection from "../sections/PartnersSection";
import Navbar from "./Navbar";
import Footer from "./Footer";
import "../skeletons/home-skeleton.css";

function PublicLayoutInner() {
  const { pathname } = useLocation();
  const { homeBlocking } = useHomePageBlocking();
  const isAuthPage = ["/login", "/register", "/forgot-password"].includes(pathname);
  const isHome = pathname === "/";

  return (
    <div className="flex min-h-screen flex-col bg-page-bg">
      <Navbar />
      <Outlet />
      {isHome ? (homeBlocking ? <PartnersBandSkeleton /> : <PartnersSection />) : null}
      {!isAuthPage ? <Footer homeBlend={isHome} /> : null}
    </div>
  );
}

const PublicLayout = () => {
  return (
    <HomePageBlockingProvider>
      <PublicLayoutInner />
    </HomePageBlockingProvider>
  );
};

export default PublicLayout;
