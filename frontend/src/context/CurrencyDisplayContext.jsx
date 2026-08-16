import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { getCurrencyDisplayRequest } from "../services/api";
import {
  BASE_CURRENCY,
  DISPLAY_DISCLAIMER,
  INDICATIVE_COPY,
  OFFICIAL_CURRENCY_COPY,
} from "../constants/displayCurrencies";
import { readPreferredDisplayCurrency } from "../utils/preferredDisplayCurrencyStorage";
import { shouldShowApproximate } from "../utils/displayMoney";

const CurrencyDisplayContext = createContext({
  baseCurrency: BASE_CURRENCY,
  displayCurrency: BASE_CURRENCY,
  rate: 1,
  detectedCountry: null,
  source: "fallback",
  disclaimer: DISPLAY_DISCLAIMER,
  officialCurrencyCopy: OFFICIAL_CURRENCY_COPY,
  indicativeCopy: INDICATIVE_COPY,
  preferred: "auto",
  showApproximate: false,
  ready: false,
  refresh: () => {},
});

export function CurrencyDisplayProvider({ children }) {
  const [preferred, setPreferredState] = useState(() => readPreferredDisplayCurrency());
  const [payload, setPayload] = useState({
    baseCurrency: BASE_CURRENCY,
    displayCurrency: BASE_CURRENCY,
    rate: 1,
    detectedCountry: null,
    source: "fallback",
    disclaimer: DISPLAY_DISCLAIMER,
    officialCurrencyCopy: OFFICIAL_CURRENCY_COPY,
    indicativeCopy: INDICATIVE_COPY,
  });
  const [ready, setReady] = useState(false);

  const load = useCallback(async (pref = readPreferredDisplayCurrency()) => {
    setPreferredState(pref);
    try {
      const data = await getCurrencyDisplayRequest({ preferred: pref });
      const row = data?.data || {};
      setPayload({
        baseCurrency: row.baseCurrency || BASE_CURRENCY,
        displayCurrency: row.displayCurrency || BASE_CURRENCY,
        rate: row.rate != null ? Number(row.rate) : null,
        detectedCountry: row.detectedCountry || null,
        source: row.source || "fallback",
        disclaimer: row.disclaimer || DISPLAY_DISCLAIMER,
        officialCurrencyCopy: row.officialCurrencyCopy || OFFICIAL_CURRENCY_COPY,
        indicativeCopy: row.indicativeCopy || INDICATIVE_COPY,
      });
    } catch {
      setPayload((prev) => ({
        ...prev,
        displayCurrency: BASE_CURRENCY,
        rate: 1,
        source: "fallback",
      }));
    } finally {
      setReady(true);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const refresh = useCallback(() => load(readPreferredDisplayCurrency()), [load]);

  const value = useMemo(() => {
    const showApproximate = shouldShowApproximate(payload.displayCurrency, payload.rate);
    return {
      ...payload,
      preferred,
      showApproximate,
      ready,
      refresh,
    };
  }, [payload, preferred, ready, refresh]);

  return <CurrencyDisplayContext.Provider value={value}>{children}</CurrencyDisplayContext.Provider>;
}

export function useCurrencyDisplay() {
  return useContext(CurrencyDisplayContext);
}
