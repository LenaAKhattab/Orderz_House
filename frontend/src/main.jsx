import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./index.css";
import "./styles/typography.css";
import "./styles/legacy-application.css";
import App from "./App";
import { LanguageProvider } from "./i18n/LanguageProvider";
import ChunkLoadErrorBoundary from "./components/layout/ChunkLoadErrorBoundary";
import {
  clearChunkReloadFlag,
  installChunkLoadRecovery,
} from "./lib/chunkLoadRecovery";

installChunkLoadRecovery();

createRoot(document.getElementById("root")).render(
  <StrictMode>
    <ChunkLoadErrorBoundary>
      <LanguageProvider>
        <App />
      </LanguageProvider>
    </ChunkLoadErrorBoundary>
  </StrictMode>
);

// Clear the one-shot reload flag only after the shell stays healthy briefly.
// Clearing immediately would allow infinite reload if a lazy route chunk keeps failing.
window.setTimeout(() => {
  clearChunkReloadFlag();
}, 2500);
