import arEconomy from "../locales/ar/economy.json";
import enEconomy from "../locales/en/economy.json";
import { mergeLocaleNamespaces } from "./resources";

mergeLocaleNamespaces({
  ar: { economy: arEconomy },
  en: { economy: enEconomy },
});
