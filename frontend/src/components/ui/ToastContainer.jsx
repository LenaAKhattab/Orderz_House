import Toast from "./Toast";

export default function ToastContainer({ toasts, onDismiss }) {
  if (!Array.isArray(toasts) || toasts.length === 0) return null;

  return (
    <section className="toast-stack" aria-label="Notifications">
      {toasts.map((t, idx) => (
        <Toast key={t.id} toast={t} index={idx} onClose={onDismiss} />
      ))}
    </section>
  );
}

