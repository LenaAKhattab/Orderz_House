import arPlanAdmin from "../locales/ar/planAdmin.json";
import enPlanAdmin from "../locales/en/planAdmin.json";
import { mergeLocaleNamespaces } from "./resources";

mergeLocaleNamespaces({
  ar: { planAdmin: arPlanAdmin },
  en: { planAdmin: enPlanAdmin },
});
