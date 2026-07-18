import {
  BadgeCheck,
  BarChart3,
  Bell,
  Building2,
  ClipboardList,
  Coins,
  Crown,
  GraduationCap,
  Landmark,
  LayoutDashboard,
  Megaphone,
  Package,
  PenLine,
  Plus,
  RefreshCw,
  Receipt,
  Shield,
  Sparkles,
  UserCog,
} from "lucide-react";

/** Shared size/stroke for admin & super-admin sidebar icons. */
export const ADMIN_NAV_ICON_SIZE = 18;
export const ADMIN_NAV_ICON_STROKE = 1.75;

const ICON_MAP = {
  overview: LayoutDashboard,
  home: LayoutDashboard,
  analytics: BarChart3,
  "internal-requests": ClipboardList,
  "training-requests": Sparkles,
  "financial-claims": Receipt,
  "financial-center": Landmark,
  plans: Crown,
  subscriptions: RefreshCw,
  "subscription-activation": BadgeCheck,
  courses: GraduationCap,
  ads: Megaphone,
  "edit-website": PenLine,
  admins: UserCog,
  "rate-limit-exemptions": Shield,
  institutions: Building2,
  "institutional-order-storage": Package,
  notifications: Bell,
  "create-order": Plus,
  bonuses: Coins,
};

/**
 * Outline lucide icon for admin/super-admin sidebar rows.
 * Color comes from `.oh-sa-navlink__icon` (currentColor).
 */
export default function AdminNavIcon({ name }) {
  const Icon = ICON_MAP[name] || LayoutDashboard;
  return (
    <Icon
      className="oh-sa-navlink__icon-svg"
      size={ADMIN_NAV_ICON_SIZE}
      strokeWidth={ADMIN_NAV_ICON_STROKE}
      aria-hidden
    />
  );
}
