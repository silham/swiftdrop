import {
  Activity,
  ChartColumn,
  ClipboardList,
  Clock,
  Inbox,
  KeyRound,
  LayoutDashboard,
  Map as MapIcon,
  Package,
  PackagePlus,
  Route,
  ScrollText,
  Store,
  Tag,
  Truck,
  Users,
  Webhook,
  type LucideIcon,
} from 'lucide-react';

/**
 * Sidebar icons by key. Nav configs are plain data passed from server layouts to the client
 * sidebar, so they reference icons by name instead of by component. Owner: M1 + M10.
 */
export const NAV_ICONS = {
  overview: LayoutDashboard,
  users: Users,
  merchants: Store,
  dispatch: Route,
  zones: MapIcon,
  pricing: Tag,
  reports: ChartColumn,
  audit: ScrollText,
  ops: Activity,
  parcels: Package,
  book: PackagePlus,
  history: Clock,
  unassigned: Inbox,
  couriers: Truck,
  orders: ClipboardList,
  keys: KeyRound,
  webhooks: Webhook,
} satisfies Record<string, LucideIcon>;

export type NavIconName = keyof typeof NAV_ICONS;
