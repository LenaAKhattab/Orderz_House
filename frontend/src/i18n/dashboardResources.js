import arDashboard from "../locales/ar/dashboard.json";
import arTrainingOrders from "../locales/ar/trainingOrders.json";
import arFreelancerDashboard from "../locales/ar/freelancerDashboard.json";
import enDashboard from "../locales/en/dashboard.json";
import enTrainingOrders from "../locales/en/trainingOrders.json";
import enFreelancerDashboard from "../locales/en/freelancerDashboard.json";
import { mergeLocaleNamespaces } from "./resources";

mergeLocaleNamespaces({
  ar: {
    dashboard: arDashboard,
    trainingOrders: arTrainingOrders,
    freelancerDashboard: arFreelancerDashboard,
  },
  en: {
    dashboard: enDashboard,
    trainingOrders: enTrainingOrders,
    freelancerDashboard: enFreelancerDashboard,
  },
});
