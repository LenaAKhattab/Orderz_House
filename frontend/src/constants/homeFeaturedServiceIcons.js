import {
  AppWindow,
  BrainCircuit,
  Handshake,
  LayoutDashboard,
  Megaphone,
  NotebookPen,
  PenTool,
  Server,
  TabletSmartphone,
} from "lucide-react";

export const HOME_FEATURED_SERVICE_ICON_MAP = {
  AppWindow,
  Server,
  TabletSmartphone,
  BrainCircuit,
  PenTool,
  LayoutDashboard,
  Megaphone,
  NotebookPen,
  Handshake,
};

export function getHomeFeaturedServiceIcon(item) {
  return HOME_FEATURED_SERVICE_ICON_MAP[item?.icon] || AppWindow;
}
