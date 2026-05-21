import {
  IconBarChart3,
  IconBell,
  IconBookOpen,
  IconClipboardCheck,
  IconMessageCircle,
  IconStar,
  IconTrendingUp,
  IconTrophy,
  IconUserCheck,
  IconWallet,
} from "./DashboardIcons";

const INSIGHT_ICON_MAP = {
  profile: IconUserCheck,
  orders: IconMessageCircle,
  courses: IconBookOpen,
  performance: IconTrophy,
  subscription: IconBell,
  reviews: IconStar,
  earnings: IconWallet,
  growth: IconTrendingUp,
  action: IconClipboardCheck,
};

export function insightIconForType(type) {
  return INSIGHT_ICON_MAP[type] || IconBarChart3;
}

export { INSIGHT_ICON_MAP };
