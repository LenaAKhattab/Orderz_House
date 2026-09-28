import arClientArea from "../locales/ar/clientArea.json";
import enClientArea from "../locales/en/clientArea.json";
import { mergeLocaleNamespaces } from "./resources";

mergeLocaleNamespaces({
  ar: { clientArea: arClientArea },
  en: { clientArea: enClientArea },
});
