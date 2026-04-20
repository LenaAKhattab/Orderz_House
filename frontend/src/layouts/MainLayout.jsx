import { Outlet } from "react-router-dom";
import Navbar from "../components/layout/Navbar";
import Footer from "../components/layout/Footer";

const MainLayout = () => {
  return (
    <div className="page-shell">
      <Navbar />
      <main className="app-shell">
        <Outlet />
      </main>
      <Footer />
    </div>
  );
};

export default MainLayout;
