import type { NavItem } from './types';

export const dispatchNav: NavItem[] = [
  { href: '/dispatch', label: 'Unassigned', owner: 'M7', icon: 'unassigned' },
  { href: '/dispatch/couriers', label: 'Courier workload', owner: 'M7', icon: 'couriers' },
  { href: '/admin/zones', label: 'Zones', owner: 'M7', icon: 'zones', section: 'Configuration' },
  {
    href: '/admin/pricing',
    label: 'Pricing',
    owner: 'M7',
    icon: 'pricing',
    section: 'Configuration',
  },
  { href: '/admin/reports', label: 'Reports', owner: 'M9', icon: 'reports', section: 'Insights' },
];
