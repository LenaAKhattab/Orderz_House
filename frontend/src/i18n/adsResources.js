import arAds from "../locales/ar/ads.json";
import enAds from "../locales/en/ads.json";
import { mergeLocaleNamespaces } from "./resources";

mergeLocaleNamespaces({
  ar: { ads: arAds },
  en: { ads: enAds },
});
