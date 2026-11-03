import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./index.css";
import "./styles/typography.css";
import "./styles/legacy-application.css";
import App from "./App";
import "./i18n/legacyResources";
import { LanguageProvider } from "./i18n/LanguageProvider";
import { applyI18nPreviewQuery, readStoredLocale, getLocaleDirection } from "./i18n/localePreference";
import { ensureLocaleLoaded, isLocaleBundleLoaded } from "./i18n/loadLocaleBundle";
import ChunkLoadErrorBoundary from "./components/layout/ChunkLoadErrorBoundary";
import {
  clearChunkReloadFlag,
  installChunkLoadRecovery,
} from "./lib/chunkLoadRecovery";

installChunkLoadRecovery();

const LOCALE_BOOT_TIMEOUT_MS = 8000;

/**
 * German / Dutch / Romanian bundles are lazy: load the stored locale BEFORE the first render so the app never
 * flashes another language or direction. If the bundle cannot be loaded in time, render the default locale.
 */
async function prepareInitialLocale() {
  applyI18nPreviewQuery(window.location.search);
  const stored = readStoredLocale();
  if (isLocaleBundleLoaded(stored)) return;
  document.documentElement.dir = getLocaleDirection(stored);
  document.documentElement.lang = stored;
  await Promise.race([
    ensureLocaleLoaded(stored),
    new Promise((_, reject) => window.setTimeout(() => reject(new Error("locale boot timeout")), LOCALE_BOOT_TIMEOUT_MS)),
  ]).catch((err) => {
    console.error("[i18n] initial locale unavailable, using default:", err?.message || err);
  });
}

function renderApp() {
  createRoot(document.getElementById("root")).render(
    <StrictMode>
      <ChunkLoadErrorBoundary>
        <LanguageProvider>
          <App />
        </LanguageProvider>
      </ChunkLoadErrorBoundary>
    </StrictMode>
  );
}

prepareInitialLocale().finally(renderApp);

// Clear the one-shot reload flag only after the shell stays healthy briefly.
// Clearing immediately would allow infinite reload if a lazy route chunk keeps failing.
window.setTimeout(() => {
  clearChunkReloadFlag();
}, 2500);
