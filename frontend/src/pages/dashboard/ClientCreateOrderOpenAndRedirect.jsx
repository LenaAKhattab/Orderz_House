import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useClientCreateOrderModal } from "../../context/ClientCreateOrderModalContext";

/** Opens the client create-order modal then replaces history with the client dashboard (bookmarkable URL). */
export default function ClientCreateOrderOpenAndRedirect() {
  const navigate = useNavigate();
  const { openModal } = useClientCreateOrderModal();

  useEffect(() => {
    openModal();
    navigate("/dashboard/client", { replace: true });
  }, [navigate, openModal]);

  return null;
}
