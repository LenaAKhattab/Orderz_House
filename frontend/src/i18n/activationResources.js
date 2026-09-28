import arActivation from "../locales/ar/activation.json";
import enActivation from "../locales/en/activation.json";
import { mergeLocaleNamespaces } from "./resources";

mergeLocaleNamespaces({
  ar: { activation: arActivation },
  en: { activation: enActivation },
});
