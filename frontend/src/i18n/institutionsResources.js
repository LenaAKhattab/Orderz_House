import arInstitutions from "../locales/ar/institutions.json";
import enInstitutions from "../locales/en/institutions.json";
import { mergeLocaleNamespaces } from "./resources";

mergeLocaleNamespaces({
  ar: { institutions: arInstitutions },
  en: { institutions: enInstitutions },
});
