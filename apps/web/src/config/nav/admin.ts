import type { NavItem } from './types';

export const adminNav: NavItem[] = [
  { href: '/admin', label: 'Overview', owner: 'M9', icon: 'overview' },
  {
    href: '/dispatch',
    label: 'Dispatch queue',
    owner: 'M7',
    icon: 'dispatch',
    section: 'Operations',
  },
  {
    href: '/dispatch/couriers',
    label: 'Courier workload',
    owner: 'M7',
    icon: 'couriers',
    section: 'Operations',
  },
  { href: '/admin/ops', label: 'Event ops', owner: 'M8', icon: 'ops', section: 'Operations' },
  { href: '/admin/users', label: 'Users', owner: 'M2', icon: 'users', section: 'Accounts' },
  {
    href: '/admin/merchants',
    label: 'Merchants',
    owner: 'M5',
    icon: 'merchants',
    section: 'Accounts',
  },
  { href: '/admin/zones', label: 'Zones', owner: 'M7', icon: 'zones', section: 'Configuration' },
  {
    href: '/admin/pricing',
    label: 'Pricing',
    owner: 'M7',
    icon: 'pricing',
    section: 'Configuration',
  },
  { href: '/admin/reports', label: 'Reports', owner: 'M9', icon: 'reports', section: 'Insights' },
  { href: '/admin/audit', label: 'Audit log', owner: 'M9', icon: 'audit', section: 'Insights' },
];
