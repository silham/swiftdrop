'use client';

import {
  ArrowRight,
  CircleCheck,
  CircleX,
  ClipboardList,
  KeyRound,
  Package,
  Truck,
  Webhook,
} from 'lucide-react';
import Link from 'next/link';
import {
  Alert,
  Badge,
  buttonClasses,
  Card,
  CardHeader,
  ChartCard,
  EmptyState,
  StatCard,
  StatGrid,
  StatusBadge,
  Table,
  type Column,
} from '@/components/ui';
import { DonutChart } from '@/components/ui/charts';
import { formatDate, formatMoney, formatPercent } from '@/lib/format';

interface MerchantProfile {
  id: string;
  businessName: string;
  contactEmail: string;
  contactPhone?: string | null;
  status: 'PENDING' | 'APPROVED' | 'REJECTED' | 'SUSPENDED' | string;
  approvedAt?: string | null;
  createdAt: string;
}

interface OrderItem {
  id: string;
  trackingNumber: string;
  merchantReference?: string;
  status: any;
  recipientName: string;
  dropoffCity: string;
  feeCents: number;
  currency: string;
  createdAt: string;
}

interface Stats {
  TOTAL: number;
  CREATED: number;
  PICKED_UP: number;
  IN_TRANSIT: number;
  OUT_FOR_DELIVERY: number;
  DELIVERED: number;
  FAILED: number;
}

/** Integration counts for the health widget. `undefined` means that request failed. */
export interface IntegrationSummary {
  apiKeys?: { active: number; revoked: number; lastUsedAt: string | null };
  webhooks?: { active: number; inactive: number };
  apiKeysError?: string;
  webhooksError?: string;
}

/** Owner: M5. Merchant dashboard: approval banner, order KPIs, status mix, integration health. */
export function MerchantDashboardView({
  merchant,
  stats,
  recentOrders,
  integration,
}: {
  merchant: MerchantProfile;
  stats: Stats;
  recentOrders: OrderItem[];
  integration: IntegrationSummary;
}) {
  const inTransit =
    (stats.IN_TRANSIT ?? 0) + (stats.PICKED_UP ?? 0) + (stats.OUT_FOR_DELIVERY ?? 0);
  const delivered = stats.DELIVERED ?? 0;
  const failed = stats.FAILED ?? 0;
  const finished = delivered + failed;
  const successRate = finished > 0 ? delivered / finished : null;

  const columns: Column<OrderItem>[] = [
    {
      header: 'Tracking #',
      cell: (row) => (
        <span className="font-mono text-[13px] font-medium text-ink">{row.trackingNumber}</span>
      ),
    },
    {
      header: 'Reference',
      cell: (row) => (
        <span className="font-mono text-xs text-muted">{row.merchantReference || '—'}</span>
      ),
    },
    {
      header: 'Recipient',
      cell: (row) => <span className="text-ink">{row.recipientName}</span>,
    },
    {
      header: 'Destination',
      cell: (row) => <span className="capitalize">{row.dropoffCity}</span>,
    },
    {
      header: 'Fee',
      headerClassName: 'text-right',
      className: 'px-4 py-3 text-right tabular-nums',
      cell: (row) => formatMoney(row.feeCents, row.currency),
    },
    {
      header: 'Status',
      cell: (row) => <StatusBadge status={row.status} />,
    },
    {
      header: 'Created',
      cell: (row) => <span className="text-xs text-muted">{formatDate(row.createdAt)}</span>,
    },
  ];

  const quickActions = [
    {
      title: 'Partner API Keys',
      body: 'Create and manage authentication keys for automated order injection.',
      href: '/merchant/api-keys',
      cta: 'Manage API Keys',
      icon: <KeyRound />,
    },
    {
      title: 'Webhook Endpoints',
      body: 'Receive real-time parcel status update notifications sent to your server.',
      href: '/merchant/webhooks',
      cta: 'Configure Webhooks',
      icon: <Webhook />,
    },
    {
      title: 'Order Management',
      body: 'View all deliveries submitted by your API and track island-wide delivery.',
      href: '/merchant/orders',
      cta: 'View All Orders',
      icon: <ClipboardList />,
    },
  ];

  return (
    <div className="space-y-6">
      {/* Approval Status Banner */}
      {merchant.status === 'PENDING' && (
        <Alert tone="warning" title="Account Pending Approval">
          Your merchant account is currently under review by our operations team. You may configure
          API keys and webhooks, but parcel creation via the partner API is restricted until
          approved.
        </Alert>
      )}

      {merchant.status === 'REJECTED' && (
        <Alert tone="error" title="Application Rejected">
          Your merchant application was rejected. Please reach out to SwiftDrop support for
          assistance.
        </Alert>
      )}

      {merchant.status === 'SUSPENDED' && (
        <Alert tone="error" title="Account Suspended">
          Your merchant account has been suspended. Incoming API calls with your API keys are
          temporarily blocked.
        </Alert>
      )}

      <StatGrid cols={5}>
        <StatCard
          label="Total orders"
          value={stats.TOTAL ?? 0}
          icon={<Package />}
          tone="brand"
          href="/merchant/orders"
          hint={`${stats.CREATED ?? 0} awaiting pickup`}
        />
        <StatCard
          label="In transit"
          value={inTransit}
          icon={<Truck />}
          tone="info"
          hint="Picked up → out for delivery"
        />
        <StatCard label="Delivered" value={delivered} icon={<CircleCheck />} tone="success" />
        <StatCard
          label="Failed"
          value={failed}
          icon={<CircleX />}
          tone={failed > 0 ? 'danger' : 'neutral'}
          hint="Delivery exceptions"
        />
        <StatCard
          label="Success rate"
          value={formatPercent(successRate)}
          icon={<CircleCheck />}
          tone="violet"
          hint={finished > 0 ? `${finished} completed` : 'No completed orders yet'}
        />
      </StatGrid>

      <div className="grid gap-6 lg:grid-cols-3">
        <ChartCard
          title="Order status"
          description="Where your parcels are right now."
          empty={(stats.TOTAL ?? 0) === 0}
          emptyTitle="No orders yet"
          emptyDescription="Status mix appears once you create parcels via the partner API."
          className="lg:col-span-2"
          minHeight={0}
        >
          <DonutChart
            label="Merchant orders by status"
            centerLabel="Orders"
            centerValue={stats.TOTAL ?? 0}
            data={[
              { name: 'Created', value: stats.CREATED ?? 0, color: 'var(--sd-subtle)' },
              { name: 'Picked up', value: stats.PICKED_UP ?? 0, color: 'var(--sd-chart-5)' },
              { name: 'In transit', value: stats.IN_TRANSIT ?? 0, color: 'var(--sd-chart-2)' },
              {
                name: 'Out for delivery',
                value: stats.OUT_FOR_DELIVERY ?? 0,
                color: 'var(--sd-chart-1)',
              },
              { name: 'Delivered', value: delivered, color: 'var(--sd-chart-3)' },
              { name: 'Failed', value: failed, color: 'var(--sd-chart-4)' },
            ]}
          />
        </ChartCard>

        <IntegrationHealth integration={integration} merchantStatus={merchant.status} />
      </div>

      <Card flush>
        <CardHeader
          title="Recent API Orders"
          description="The latest parcels created with your partner API keys."
          actions={
            <Link
              href="/merchant/orders"
              className="inline-flex items-center gap-1 text-xs font-medium text-brand hover:underline"
            >
              View all ({stats.TOTAL ?? 0}) <ArrowRight className="h-3 w-3" aria-hidden="true" />
            </Link>
          }
        />
        <Table
          bare
          columns={columns}
          rows={recentOrders}
          rowKey={(r) => r.id}
          empty={
            <div className="p-5">
              <EmptyState
                compact
                className="border-0"
                icon={<Package />}
                title="No orders yet"
                description="No orders have been submitted yet. Use your partner API key to begin creating parcels."
              />
            </div>
          }
        />
      </Card>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        {quickActions.map((a) => (
          <Card key={a.href} className="flex flex-col justify-between gap-4">
            <div className="flex items-start gap-3">
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-brand-soft text-brand [&_svg]:h-4 [&_svg]:w-4">
                {a.icon}
              </span>
              <div>
                <h3 className="font-semibold text-ink">{a.title}</h3>
                <p className="mt-1 text-xs text-muted">{a.body}</p>
              </div>
            </div>
            <Link
              href={a.href}
              className={buttonClasses({ variant: 'secondary', size: 'sm', className: 'w-full' })}
            >
              {a.cta}
            </Link>
          </Card>
        ))}
      </div>
    </div>
  );
}

function IntegrationHealth({
  integration,
  merchantStatus,
}: {
  integration: IntegrationSummary;
  merchantStatus: string;
}) {
  const { apiKeys, webhooks } = integration;
  const ready = merchantStatus === 'APPROVED' && (apiKeys?.active ?? 0) > 0;
  return (
    <Card flush className="flex flex-col">
      <CardHeader
        title="Integration health"
        description="Partner API and webhook setup."
        actions={
          <Badge tone={ready ? 'success' : 'warning'} dot>
            {ready ? 'Ready' : 'Setup needed'}
          </Badge>
        }
      />
      <ul className="flex-1 divide-y divide-line">
        <li className="flex items-center gap-3 px-5 py-4">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-info-soft text-info">
            <KeyRound className="h-4 w-4" aria-hidden="true" />
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-medium text-ink">API keys</p>
            {integration.apiKeysError ? (
              <p className="text-xs text-danger">{integration.apiKeysError}</p>
            ) : (
              <p className="text-xs text-muted">
                {apiKeys?.lastUsedAt
                  ? `Last used ${formatDate(apiKeys.lastUsedAt)}`
                  : 'Not used yet'}
                {apiKeys && apiKeys.revoked > 0 ? ` · ${apiKeys.revoked} revoked` : ''}
              </p>
            )}
          </div>
          <span className="text-right">
            <span className="block text-lg font-semibold text-ink tabular-nums">
              {apiKeys?.active ?? '—'}
            </span>
            <span className="block text-[11px] text-muted">active</span>
          </span>
        </li>
        <li className="flex items-center gap-3 px-5 py-4">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-violet-soft text-violet">
            <Webhook className="h-4 w-4" aria-hidden="true" />
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-medium text-ink">Webhook endpoints</p>
            {integration.webhooksError ? (
              <p className="text-xs text-danger">{integration.webhooksError}</p>
            ) : (
              <p className="text-xs text-muted">
                {webhooks && webhooks.active + webhooks.inactive > 0
                  ? `${webhooks.inactive} disabled`
                  : 'No endpoints configured'}
              </p>
            )}
          </div>
          <span className="text-right">
            <span className="block text-lg font-semibold text-ink tabular-nums">
              {webhooks?.active ?? '—'}
            </span>
            <span className="block text-[11px] text-muted">active</span>
          </span>
        </li>
      </ul>
      <div className="grid grid-cols-2 gap-2 border-t border-line p-4">
        <Link
          href="/merchant/api-keys"
          className={buttonClasses({ variant: 'secondary', size: 'sm' })}
        >
          API keys
        </Link>
        <Link
          href="/merchant/webhooks"
          className={buttonClasses({ variant: 'secondary', size: 'sm' })}
        >
          Webhooks
        </Link>
      </div>
    </Card>
  );
}
