import type { NavIconName } from '@/components/layout/nav-icons';

export interface NavItem {
  href: string;
  label: string;
  /** Member who owns the page (for humans/agents reading the config). */
  owner: string;
  /** Sidebar icon key (see components/layout/nav-icons.ts). */
  icon?: NavIconName;
  /** Sidebar group heading. Items keep their order; consecutive items share a group. */
  section?: string;
}
