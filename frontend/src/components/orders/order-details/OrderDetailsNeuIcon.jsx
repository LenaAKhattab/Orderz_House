import {
  Banknote,
  Briefcase,
  ClipboardList,
  Clock,
  LayoutGrid,
  Shield,
  Star,
} from "lucide-react";

const ICON_MAP = {
  price: Banknote,
  clock: Clock,
  category: LayoutGrid,
  title: ClipboardList,
  description: Briefcase,
  skills: Star,
  files: Shield,
};

/**
 * Soft 3D icon chip for pool order details (matches marketplace neu style).
 * @param {{ name?: keyof typeof ICON_MAP }} props
 * @param {"circle"|"squircle"} [props.variant]
 */
export default function OrderDetailsNeuIcon({ name = "title", variant = "circle" }) {
  const Icon = ICON_MAP[name] || ClipboardList;
  return (
    <span className={`od-neu-icon od-neu-icon--${variant}`} aria-hidden>
      <Icon size={variant === "squircle" ? 20 : 18} strokeWidth={2.15} />
    </span>
  );
}
