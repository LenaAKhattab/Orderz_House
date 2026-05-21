import { Suspense, lazy } from "react";
import { useLocation } from "react-router-dom";
import LazyRouteOutlet from "./LazyRouteOutlet";
import { HomePageBlockingProvider } from "../../context/HomePageBlockingContext.jsx";
import { useHomePageBlocking } from "../../hooks/useHomePageBlocking";
import PartnersBandSkeleton from "../skeletons/PartnersBandSkeleton";
import Navbar from "./Navbar";
import Footer from "./Footer";

const PartnersSection = lazy(() => import("../sections/PartnersSection"));

function PublicLayoutInner() {
  const { pathname } = useLocation();
  const { homeBlocking } = useHomePageBlocking();
  const isAuthPage = ["/login", "/register", "/forgot-password"].includes(pathname);
  const isHome = pathname === "/";

  return (
    <div className={`relative flex min-h-screen flex-col ${isHome ? "home-public-layout" : "bg-page-bg"}`}>
      <Navbar />
      <LazyRouteOutlet />
      {isHome ? (
        homeBlocking ? (
          <PartnersBandSkeleton />
        ) : (
          <Suspense fallback={<PartnersBandSkeleton />}>
            <PartnersSection />
          </Suspense>
        )
      ) : null}
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
