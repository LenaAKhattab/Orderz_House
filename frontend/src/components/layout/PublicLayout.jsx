import { Suspense, lazy } from "react";
import { useLocation } from "react-router-dom";
import LazyRouteOutlet from "./LazyRouteOutlet";
import { HomePageBlockingProvider } from "../../context/HomePageBlockingContext.jsx";
import { useHeroWallpaperReady } from "../../hooks/useHeroWallpaperReady";
import PartnersBandSkeleton from "../skeletons/PartnersBandSkeleton";
import Navbar from "./Navbar";
import Footer from "./Footer";
import "../../styles/publicHomeShell.css";

const PartnersSection = lazy(() => import("../sections/PartnersSection"));

function PublicLayoutInner() {
  const { pathname } = useLocation();
  const isAuthPage = ["/login", "/register", "/forgot-password"].includes(pathname);
  const isHome = pathname === "/";
  const wallpaperReady = useHeroWallpaperReady(isHome);

  return (
    <div
      className={`relative flex min-h-screen flex-col ${isHome ? "home-public-layout" : "bg-page-bg"}${isHome && wallpaperReady ? " home-public-layout--wallpaper-ready" : ""}`.trim()}
    >
      <Navbar />
      <LazyRouteOutlet />
      {isHome ? (
        <div className="home-desktop-only">
          <Suspense fallback={<PartnersBandSkeleton />}>
            <PartnersSection />
          </Suspense>
        </div>
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
