import type { NavItem } from './types';

export const merchantNav: NavItem[] = [
  { href: '/merchant', label: 'Dashboard', owner: 'M5', icon: 'overview' },
  { href: '/merchant/orders', label: 'Orders', owner: 'M5', icon: 'orders' },
  {
    href: '/merchant/api-keys',
    label: 'API keys',
    owner: 'M5',
    icon: 'keys',
    section: 'Developers',
  },
  {
    href: '/merchant/webhooks',
    label: 'Webhooks',
    owner: 'M5',
    icon: 'webhooks',
    section: 'Developers',
  },
];
