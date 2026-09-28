import arStatuses from "../locales/ar/statuses.json" with { type: "json" };
import enStatuses from "../locales/en/statuses.json" with { type: "json" };
import { mergeLocaleNamespaces } from "./resources.js";

mergeLocaleNamespaces({
  ar: { statuses: arStatuses },
  en: { statuses: enStatuses },
});
