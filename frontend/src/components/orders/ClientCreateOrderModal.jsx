import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../../context/useAuth";
import { INTERNAL_ORDERS_LIST_REFRESH } from "../../constants/authRoutes";
import AdminInternalOrderWizard from "./AdminInternalOrderWizard";

export default function ClientCreateOrderModal({ open, onClose }) {
  const navigate = useNavigate();
  const { user } = useAuth();
  const accountRole = user?.primaryRole || user?.role;
  const isAdminLike = accountRole === "admin" || accountRole === "super_admin";

  useEffect(() => {
    if (!open) return;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prevOverflow;
    };
  }, [open]);

  if (!open) return null;

  if (isAdminLike) {
    const adminOrdersPath =
      accountRole === "super_admin" ? "/dashboard/super-admin/orders" : "/dashboard/admin/orders";
    return (
      <div
        className="client-order-modal-overlay"
        role="presentation"
        onMouseDown={(e) => {
          if (e.target === e.currentTarget) onClose();
        }}
      >
        <div
          className="client-order-modal client-order-modal--admin-wizard"
          role="dialog"
          aria-modal="true"
          aria-labelledby="admin-create-order-modal-title"
          dir="rtl"
          onMouseDown={(e) => e.stopPropagation()}
        >
          <header className="client-order-modal__head">
            <div>
              <h2 id="admin-create-order-modal-title" className="client-order-modal__title">
                إنشاء طلب (إداري)
              </h2>
            </div>
            <button type="button" className="btn btn-secondary client-order-modal__close" onClick={() => onClose()}>
              إغلاق
            </button>
          </header>
          <div className="client-order-modal__body client-order-modal__body--admin-wizard">
            <AdminInternalOrderWizard
              variant="modal"
              onCreated={() => {
                onClose();
                navigate(adminOrdersPath);
                window.dispatchEvent(new CustomEvent(INTERNAL_ORDERS_LIST_REFRESH));
              }}
            />
          </div>
        </div>
      </div>
    );
  }

  return (
    <div
      className="client-order-modal-overlay"
      role="presentation"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        className="client-order-modal client-order-modal--admin-wizard"
        role="dialog"
        aria-modal="true"
        aria-labelledby="client-create-order-modal-title"
        dir="rtl"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <header className="client-order-modal__head">
          <div>
            <h2 id="client-create-order-modal-title" className="client-order-modal__title">
              إنشاء طلب
            </h2>
          </div>
        </header>
        <div className="client-order-modal__body client-order-modal__body--admin-wizard">
          <AdminInternalOrderWizard
            variant="modal"
            audience="client"
            onCreated={() => {
              onClose();
              navigate("/dashboard/client/my-orders");
              window.dispatchEvent(new CustomEvent(INTERNAL_ORDERS_LIST_REFRESH));
            }}
          />
        </div>
        <footer className="client-order-modal__foot">
          <div className="client-order-modal__foot-left">
            <button type="button" className="btn btn-secondary" onClick={() => onClose()}>
              إغلاق
            </button>
          </div>
        </footer>
      </div>
    </div>
  );
}
