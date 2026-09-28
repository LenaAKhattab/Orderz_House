import arSubscriptions from "../locales/ar/subscriptions.json" with { type: "json" };
import enSubscriptions from "../locales/en/subscriptions.json" with { type: "json" };
import { mergeLocaleNamespaces } from "./resources.js";

mergeLocaleNamespaces({
  ar: { subscriptions: arSubscriptions },
  en: { subscriptions: enSubscriptions },
});
