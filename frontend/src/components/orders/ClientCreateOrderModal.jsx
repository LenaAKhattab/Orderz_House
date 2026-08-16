import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { FilePlus2, X } from "lucide-react";
import { useAuth } from "../../context/useAuth";
import { INTERNAL_ORDERS_LIST_REFRESH } from "../../constants/authRoutes";
import AdminInternalOrderWizard from "./AdminInternalOrderWizard";
import "../../styles/createOrderModal.css";

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
        className="client-order-modal-overlay max-[420px]:overflow-x-clip max-[420px]:p-2"
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
          <header className="client-order-modal__head co-modal-ref__head">
            <div className="co-modal-ref__head-main">
              <span className="co-modal-ref__head-icon" aria-hidden="true">
                <FilePlus2 size={22} strokeWidth={2.25} />
              </span>
              <h2 id="admin-create-order-modal-title" className="client-order-modal__title co-modal-ref__title">
                إنشاء طلب (إداري)
              </h2>
            </div>
            <button
              type="button"
              className="co-modal-ref__close"
              onClick={() => onClose()}
              aria-label="إغلاق"
            >
              <X size={20} strokeWidth={2.25} aria-hidden="true" />
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
      className="client-order-modal-overlay max-[420px]:overflow-x-clip max-[420px]:p-2"
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
        <header className="client-order-modal__head co-modal-ref__head">
          <div className="co-modal-ref__head-main">
            <span className="co-modal-ref__head-icon" aria-hidden="true">
              <FilePlus2 size={22} strokeWidth={2.25} />
            </span>
            <h2 id="client-create-order-modal-title" className="client-order-modal__title co-modal-ref__title">
              إنشاء طلب
            </h2>
          </div>
          <button
            type="button"
            className="co-modal-ref__close"
            onClick={() => onClose()}
            aria-label="إغلاق"
          >
            <X size={20} strokeWidth={2.25} aria-hidden="true" />
          </button>
        </header>
        <div className="client-order-modal__body client-order-modal__body--admin-wizard">
          <AdminInternalOrderWizard
            variant="modal"
            audience="client"
            modalOnClose={onClose}
            onCreated={() => {
              onClose();
              navigate("/dashboard/client/my-orders");
              window.dispatchEvent(new CustomEvent(INTERNAL_ORDERS_LIST_REFRESH));
            }}
          />
        </div>
      </div>
    </div>
  );
}
