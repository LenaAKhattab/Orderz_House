import { createContext, useCallback, useContext, useMemo, useState } from "react";
import ClientCreateOrderModal from "../components/orders/ClientCreateOrderModal";

const ClientCreateOrderModalContext = createContext(null);

export function ClientCreateOrderModalProvider({ children }) {
  const [open, setOpen] = useState(false);

  const openModal = useCallback(() => setOpen(true), []);
  const closeModal = useCallback(() => setOpen(false), []);

  const value = useMemo(() => ({ open, openModal, closeModal }), [open, openModal, closeModal]);

  return (
    <ClientCreateOrderModalContext.Provider value={value}>
      {children}
      <ClientCreateOrderModal open={open} onClose={closeModal} />
    </ClientCreateOrderModalContext.Provider>
  );
}

export function useClientCreateOrderModal() {
  const ctx = useContext(ClientCreateOrderModalContext);
  if (!ctx) {
    return { open: false, openModal: () => {}, closeModal: () => {} };
  }
  return ctx;
}
