import arPantry from "../locales/ar/pantry.json";
import enPantry from "../locales/en/pantry.json";
import { mergeLocaleNamespaces } from "./resources";

mergeLocaleNamespaces({
  ar: { pantry: arPantry },
  en: { pantry: enPantry },
});
