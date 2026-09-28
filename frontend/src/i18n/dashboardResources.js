import arDashboard from "../locales/ar/dashboard.json";
import arTrainingOrders from "../locales/ar/trainingOrders.json";
import arFreelancerDashboard from "../locales/ar/freelancerDashboard.json";
import arUsers from "../locales/ar/users.json";
import enDashboard from "../locales/en/dashboard.json";
import enTrainingOrders from "../locales/en/trainingOrders.json";
import enFreelancerDashboard from "../locales/en/freelancerDashboard.json";
import enUsers from "../locales/en/users.json";
import { mergeLocaleNamespaces } from "./resources";

mergeLocaleNamespaces({
  ar: {
    dashboard: arDashboard,
    trainingOrders: arTrainingOrders,
    freelancerDashboard: arFreelancerDashboard,
    users: arUsers,
  },
  en: {
    dashboard: enDashboard,
    trainingOrders: enTrainingOrders,
    freelancerDashboard: enFreelancerDashboard,
    users: enUsers,
  },
});
