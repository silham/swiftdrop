'use client';

import Link from 'next/link';
import { Alert, Button, Card, StatusBadge, Table, type Column } from '@/components/ui';

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

export function MerchantDashboardView({
  merchant,
  stats,
  recentOrders,
}: {
  merchant: MerchantProfile;
  stats: Stats;
  recentOrders: OrderItem[];
}) {
  const columns: Column<OrderItem>[] = [
    {
      header: 'Tracking #',
      cell: (row) => (
        <span className="font-mono font-medium text-brand">{row.trackingNumber}</span>
      ),
    },
    {
      header: 'Reference',
      cell: (row) => (
        <span className="text-muted font-mono text-xs">{row.merchantReference || '—'}</span>
      ),
    },
    {
      header: 'Recipient',
      cell: (row) => <span>{row.recipientName}</span>,
    },
    {
      header: 'Destination',
      cell: (row) => <span className="capitalize">{row.dropoffCity}</span>,
    },
    {
      header: 'Status',
      cell: (row) => <StatusBadge status={row.status} />,
    },
    {
      header: 'Created',
      cell: (row) => (
        <span className="text-xs text-muted">
          {new Date(row.createdAt).toLocaleDateString()}
        </span>
      ),
    },
  ];

  return (
    <div className="space-y-6">
      {/* Approval Status Banner */}
      {merchant.status === 'PENDING' && (
        <Alert tone="warning">
          <p className="font-semibold text-amber-800">Account Pending Approval</p>
          <p className="mt-0.5 text-sm">
            Your merchant account is currently under review by our operations team. You may configure
            API keys and webhooks, but parcel creation via the partner API is restricted until approved.
          </p>
        </Alert>
      )}

      {merchant.status === 'REJECTED' && (
        <Alert tone="error">
          <p className="font-semibold">Application Rejected</p>
          <p className="mt-0.5 text-sm">
            Your merchant application was rejected. Please reach out to SwiftDrop support for assistance.
          </p>
        </Alert>
      )}

      {merchant.status === 'SUSPENDED' && (
        <Alert tone="error">
          <p className="font-semibold">Account Suspended</p>
          <p className="mt-0.5 text-sm">
            Your merchant account has been suspended. Incoming API calls with your API keys are temporarily blocked.
          </p>
        </Alert>
      )}

      {/* Overview Stat Cards */}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <Card className="p-4">
          <p className="text-xs font-medium text-muted uppercase">Total Orders</p>
          <p className="mt-1 text-2xl font-bold">{stats.TOTAL ?? 0}</p>
        </Card>
        <Card className="p-4">
          <p className="text-xs font-medium text-muted uppercase">Created</p>
          <p className="mt-1 text-2xl font-bold text-slate-700">{stats.CREATED ?? 0}</p>
        </Card>
        <Card className="p-4">
          <p className="text-xs font-medium text-muted uppercase">In Transit</p>
          <p className="mt-1 text-2xl font-bold text-blue-600">
            {(stats.IN_TRANSIT ?? 0) + (stats.PICKED_UP ?? 0) + (stats.OUT_FOR_DELIVERY ?? 0)}
          </p>
        </Card>
        <Card className="p-4">
          <p className="text-xs font-medium text-muted uppercase">Delivered</p>
          <p className="mt-1 text-2xl font-bold text-emerald-600">{stats.DELIVERED ?? 0}</p>
        </Card>
      </div>

      {/* Quick Action Cards */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <Card className="p-4 flex flex-col justify-between space-y-3">
          <div>
            <h3 className="font-semibold">Partner API Keys</h3>
            <p className="text-xs text-muted mt-1">
              Create and manage authentication keys for automated order injection.
            </p>
          </div>
          <Link href="/merchant/api-keys">
            <Button variant="secondary" className="w-full text-xs">
              Manage API Keys
            </Button>
          </Link>
        </Card>

        <Card className="p-4 flex flex-col justify-between space-y-3">
          <div>
            <h3 className="font-semibold">Webhook Endpoints</h3>
            <p className="text-xs text-muted mt-1">
              Receive real-time parcel status update notifications sent to your server.
            </p>
          </div>
          <Link href="/merchant/webhooks">
            <Button variant="secondary" className="w-full text-xs">
              Configure Webhooks
            </Button>
          </Link>
        </Card>

        <Card className="p-4 flex flex-col justify-between space-y-3">
          <div>
            <h3 className="font-semibold">Order Management</h3>
            <p className="text-xs text-muted mt-1">
              View all deliveries submitted by your API and track island-wide delivery.
            </p>
          </div>
          <Link href="/merchant/orders">
            <Button variant="secondary" className="w-full text-xs">
              View All Orders
            </Button>
          </Link>
        </Card>
      </div>

      {/* Recent Orders Section */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-base font-semibold">Recent API Orders</h2>
          <Link href="/merchant/orders" className="text-xs text-brand hover:underline">
            View all ({stats.TOTAL ?? 0}) →
          </Link>
        </div>

        <Table
          columns={columns}
          rows={recentOrders}
          rowKey={(r) => r.id}
          empty={
            <div className="rounded-lg border border-dashed border-line bg-surface p-8 text-center text-sm text-muted">
              No orders have been submitted yet. Use your partner API key to begin creating parcels.
            </div>
          }
        />
      </div>
    </div>
  );
}

