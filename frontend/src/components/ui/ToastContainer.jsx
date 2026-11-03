import Toast from "./Toast";
import { useTranslation } from "../../i18n/LanguageProvider";

export default function ToastContainer({ toasts, onDismiss }) {
  const { t } = useTranslation();
  if (!Array.isArray(toasts) || toasts.length === 0) return null;

  return (
    <section className="toast-stack" aria-label={t("platformComponents.toast.regionAria")}>
      {toasts.map((toast, idx) => (
        <Toast key={toast.id} toast={toast} index={idx} onClose={onDismiss} />
      ))}
    </section>
  );
}

