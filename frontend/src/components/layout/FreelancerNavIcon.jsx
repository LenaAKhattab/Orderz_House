import {
  BriefcaseBusiness,
  ClipboardList,
  Crown,
  ExternalLink,
  GraduationCap,
  LayoutDashboard,
  MessageSquare,
  Settings2,
  Wallet,
} from "lucide-react";

const ICON_MAP = {
  dashboard: LayoutDashboard,
  orders: BriefcaseBusiness,
  "my-orders": ClipboardList,
  wallet: Wallet,
  plans: Crown,
  messages: MessageSquare,
  courses: GraduationCap,
  settings: Settings2,
  external: ExternalLink,
  financial: Wallet,
};

export default function FreelancerNavIcon({ name, active = false }) {
  const Icon = ICON_MAP[name] || LayoutDashboard;

  return (
    <span
      className={`fdl-nav-icon__surface${active ? " fdl-nav-icon__surface--active" : ""}`}
      aria-hidden
    >
      <Icon className="fdl-nav-icon" size={20} strokeWidth={1.75} />
    </span>
  );
}
