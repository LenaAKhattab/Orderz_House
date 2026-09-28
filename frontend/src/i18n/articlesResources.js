import arArticles from "../locales/ar/articles.json";
import enArticles from "../locales/en/articles.json";
import { mergeLocaleNamespaces } from "./resources";

mergeLocaleNamespaces({
  ar: { articles: arArticles },
  en: { articles: enArticles },
});
