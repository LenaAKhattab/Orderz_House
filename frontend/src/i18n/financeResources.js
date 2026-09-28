import arFinance from "../locales/ar/finance.json";
import enFinance from "../locales/en/finance.json";
import { mergeLocaleNamespaces } from "./resources";

mergeLocaleNamespaces({
  ar: { finance: arFinance },
  en: { finance: enFinance },
});
