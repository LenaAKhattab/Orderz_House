import arReferrals from "../locales/ar/referrals.json";
import enReferrals from "../locales/en/referrals.json";
import { mergeLocaleNamespaces } from "./resources";

mergeLocaleNamespaces({
  ar: { referrals: arReferrals },
  en: { referrals: enReferrals },
});
