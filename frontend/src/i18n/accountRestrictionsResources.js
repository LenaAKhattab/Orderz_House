import arAccountRestrictions from "../locales/ar/accountRestrictions.json";
import enAccountRestrictions from "../locales/en/accountRestrictions.json";
import { mergeLocaleNamespaces } from "./resources";

mergeLocaleNamespaces({
  ar: { accountRestrictions: arAccountRestrictions },
  en: { accountRestrictions: enAccountRestrictions },
});
