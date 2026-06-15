import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./index.css";
import "./styles/typography.css";
import "./styles/legacy-application.css";
import App from "./App";
import { LanguageProvider } from "./i18n/LanguageProvider";

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <LanguageProvider>
      <App />
    </LanguageProvider>
  </StrictMode>,
);
