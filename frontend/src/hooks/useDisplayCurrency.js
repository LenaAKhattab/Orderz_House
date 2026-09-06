import { useMemo } from "react";
import { useLocation } from "react-router-dom";
import { useAuth } from "../context/useAuth";
import { useTranslation } from "../i18n/LanguageProvider";
import { usePublicGeo } from "./usePublicGeo";
import { DISPLAY_CURRENCY } from "../config/currencyDisplayConfig";
import {
  formatActivationFeeAmount,
  formatFreePlanActivationFeeNote,
  formatPriceFromJod,
  getDisplayCurrencyForCountry,
  resolvePlanPriceDisplay,
  resolveUserCountryCode,
} from "../utils/currencyDisplay";

/**
 * Display currency for public plans pricing (JOD default, EGP for Egypt).
 * Does not affect checkout amounts.
 */
export function useDisplayCurrency() {
  const { user } = useAuth();
  const location = useLocation();
  const { locale, t } = useTranslation();
  const geoCountryCode = usePublicGeo();

  const countryCode = useMemo(() => {
    const searchParams = new URLSearchParams(location.search || "");
    return resolveUserCountryCode({ user, searchParams, geoCountryCode });
  }, [user, location.search, geoCountryCode]);

  const displayCurrency = useMemo(
    () => getDisplayCurrencyForCountry(countryCode),
    [countryCode],
  );

  const isEgyptDisplay = displayCurrency === DISPLAY_CURRENCY.EGP;

  return useMemo(
    () => ({
      countryCode,
      displayCurrency,
      isEgyptDisplay,
      formatPriceFromJod: (amountJod) => formatPriceFromJod(amountJod, { locale, displayCurrency }),
      resolvePlanPriceDisplay: (plan, basePrice) =>
        resolvePlanPriceDisplay(plan, basePrice, locale, t, displayCurrency),
      formatActivationFeeAmount: (amountJod) =>
        formatActivationFeeAmount(amountJod, locale, displayCurrency),
      formatFreePlanActivationFeeNote: (amountJod) =>
        formatFreePlanActivationFeeNote(amountJod, locale, t, displayCurrency),
    }),
    [countryCode, displayCurrency, isEgyptDisplay, locale, t],
  );
}
