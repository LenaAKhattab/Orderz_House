import { useEffect } from "react";
import { useLocation } from "react-router-dom";
import { APP_NAME } from "../../constants/app";

/**
 * Keeps the browser tab title fixed to the app name (never the route path).
 */
export default function DocumentTitle() {
  const { pathname, search, hash } = useLocation();

  useEffect(() => {
    document.title = APP_NAME;
  }, [pathname, search, hash]);

  return null;
}
