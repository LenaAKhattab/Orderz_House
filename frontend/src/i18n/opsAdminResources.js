import arOpsAdmin from "../locales/ar/opsAdmin.json";
import enOpsAdmin from "../locales/en/opsAdmin.json";
import { mergeLocaleNamespaces } from "./resources";

mergeLocaleNamespaces({
  ar: { opsAdmin: arOpsAdmin },
  en: { opsAdmin: enOpsAdmin },
});
