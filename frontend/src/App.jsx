import { BrowserRouter, Route, Routes } from "react-router-dom";
import { AuthProvider } from "./context/AuthContext";
import PublicLayout from "./components/layout/PublicLayout";
import MainLayout from "./layouts/MainLayout";
import { DashboardRedirect, GuestOnly, RequireAuth, RequireRole } from "./components/auth/AuthGuards";
import Home from "./pages/Home";
import About from "./pages/About";
import Services from "./pages/Services";
import Orders from "./pages/Orders";
import Contact from "./pages/Contact";
import Login from "./pages/Login";
import Register from "./pages/Register";
import ForgotPassword from "./pages/ForgotPassword";
import PrivacyPolicy from "./pages/PrivacyPolicy";
import TermsConditions from "./pages/TermsConditions";
import Unauthorized from "./pages/Unauthorized";
import DashboardPage from "./pages/dashboard/DashboardPage";
import { ROLE } from "./constants/authRoutes";

function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <Routes>
          <Route element={<PublicLayout />}>
            <Route path="/" element={<Home />} />
            <Route path="/about" element={<About />} />
            <Route path="/services" element={<Services />} />
            <Route path="/orders" element={<Orders />} />
            <Route path="/contact" element={<Contact />} />
            <Route
              path="/login"
              element={
                <GuestOnly>
                  <Login />
                </GuestOnly>
              }
            />
            <Route
              path="/register"
              element={
                <GuestOnly>
                  <Register />
                </GuestOnly>
              }
            />
            <Route path="/forgot-password" element={<ForgotPassword />} />
            <Route path="/privacy-policy" element={<PrivacyPolicy />} />
            <Route path="/terms-conditions" element={<TermsConditions />} />
            <Route path="/unauthorized" element={<Unauthorized />} />
          </Route>

          <Route element={<RequireAuth />}>
            <Route element={<MainLayout />}>
              <Route path="/dashboard" element={<DashboardRedirect />} />
              <Route
                path="/dashboard/super-admin"
                element={
                  <RequireRole allowedRoles={[ROLE.SUPER_ADMIN]}>
                    <DashboardPage />
                  </RequireRole>
                }
              />
              <Route
                path="/dashboard/admin"
                element={
                  <RequireRole allowedRoles={[ROLE.ADMIN]}>
                    <DashboardPage />
                  </RequireRole>
                }
              />
              <Route
                path="/dashboard/freelancer"
                element={
                  <RequireRole allowedRoles={[ROLE.FREELANCER]}>
                    <DashboardPage />
                  </RequireRole>
                }
              />
              <Route
                path="/dashboard/freelancer/my-orders"
                element={
                  <RequireRole allowedRoles={[ROLE.FREELANCER]}>
                    <DashboardPage />
                  </RequireRole>
                }
              />
              <Route
                path="/dashboard/freelancer/orders"
                element={
                  <RequireRole allowedRoles={[ROLE.FREELANCER]}>
                    <DashboardPage />
                  </RequireRole>
                }
              />
              <Route
                path="/dashboard/freelancer/financial-claims"
                element={
                  <RequireRole allowedRoles={[ROLE.FREELANCER]}>
                    <DashboardPage />
                  </RequireRole>
                }
              />
              <Route
                path="/dashboard/client"
                element={
                  <RequireRole allowedRoles={[ROLE.CLIENT]}>
                    <DashboardPage />
                  </RequireRole>
                }
              />
            </Route>
          </Route>
        </Routes>
      </AuthProvider>
    </BrowserRouter>
  );
}

export default App;
