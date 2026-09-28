import arSiteEditor from "../locales/ar/siteEditor.json";
import enSiteEditor from "../locales/en/siteEditor.json";
import { mergeLocaleNamespaces } from "./resources";

mergeLocaleNamespaces({
  ar: { siteEditor: arSiteEditor },
  en: { siteEditor: enSiteEditor },
});
