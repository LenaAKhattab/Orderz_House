import { ToastProvider as GlobalToastProvider, useToast } from "../../context/ToastContext.jsx";
import ToastContainer from "./ToastContainer";

export function ToastProvider({ children }) {
  return (
    <GlobalToastProvider>
      <ToastProviderInner>{children}</ToastProviderInner>
    </GlobalToastProvider>
  );
}

function ToastProviderInner({ children }) {
  const { toasts, dismiss } = useToast();
  return (
    <>
      {children}
      <ToastContainer toasts={toasts} onDismiss={dismiss} />
    </>
  );
}

