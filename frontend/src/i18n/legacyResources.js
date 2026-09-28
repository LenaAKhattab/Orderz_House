import arLegacy from "../locales/ar/legacy.json";
import enLegacy from "../locales/en/legacy.json";
import { mergeLocaleNamespaces } from "./resources";

mergeLocaleNamespaces({
  ar: { legacy: arLegacy },
  en: { legacy: enLegacy },
});
