'use client';

import { Package, Search } from 'lucide-react';
import { useEffect, useState, type ComponentProps } from 'react';
import {
  Alert,
  Card,
  CardFooter,
  EmptyState,
  Input,
  Pagination,
  Skeleton,
  StatusBadge,
  Table,
  Tabs,
  type Column,
} from '@/components/ui';
import { errorMessage } from '@/lib/api/errors';
import { formatDate, formatMoney } from '@/lib/format';

type ParcelStatus = ComponentProps<typeof StatusBadge>['status'];

interface ParcelItem {
  id: string;
  trackingNumber: string;
  merchantReference?: string | null;
  status: ParcelStatus;
  senderName: string;
  recipientName: string;
  dropoffCity: string;
  feeCents: number;
  currency: string;
  createdAt: string;
}

interface OrdersResponse {
  data: ParcelItem[];
  meta?: { total?: number };
}

const STATUS_OPTIONS = [
  { value: '', label: 'All' },
  { value: 'CREATED', label: 'Created' },
  { value: 'PICKED_UP', label: 'Picked up' },
  { value: 'IN_TRANSIT', label: 'In transit' },
  { value: 'OUT_FOR_DELIVERY', label: 'Out for delivery' },
  { value: 'DELIVERED', label: 'Delivered' },
  { value: 'FAILED', label: 'Failed' },
];

/** Owner: M5. Paginated, status-filtered list of the merchant's partner-API parcels. */
export function MerchantOrdersView() {
  const [orders, setOrders] = useState<ParcelItem[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const pageSize = 10;
  const [selectedStatus, setSelectedStatus] = useState('');
  const [searchTerm, setSearchTerm] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const controller = new AbortController();

    async function fetchOrders() {
      try {
        const params = new URLSearchParams({
          page: String(page),
          pageSize: String(pageSize),
        });
        if (selectedStatus) params.set('status', selectedStatus);

        const res = await fetch(`/api/v1/merchants/me/parcels?${params}`, {
          signal: controller.signal,
        });
        if (!res.ok) throw await res.json();

        const body: OrdersResponse = await res.json();
        if (controller.signal.aborted) return;
        setOrders(body.data ?? []);
        setTotal(body.meta?.total ?? 0);
        setError(null);
      } catch (err) {
        if (controller.signal.aborted) return;
        setError(errorMessage(err, 'Failed to load merchant orders'));
        setOrders([]);
        setTotal(0);
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    }

    void fetchOrders();
    return () => controller.abort();
  }, [page, pageSize, selectedStatus]);

  const filteredOrders = orders.filter((order) => {
    const term = searchTerm.trim().toLowerCase();
    if (!term) return true;
    return (
      order.trackingNumber.toLowerCase().includes(term) ||
      (order.merchantReference?.toLowerCase().includes(term) ?? false) ||
      order.recipientName.toLowerCase().includes(term)
    );
  });

  const columns: Column<ParcelItem>[] = [
    {
      header: 'Tracking #',
      cell: (row) => (
        <span className="font-mono text-[13px] font-medium text-ink">{row.trackingNumber}</span>
      ),
    },
    {
      header: 'Your Reference',
      cell: (row) => (
        <span className="font-mono text-xs text-muted">{row.merchantReference || '—'}</span>
      ),
    },
    {
      header: 'Recipient',
      cell: (row) => <span className="font-medium text-ink">{row.recipientName}</span>,
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

  return (
    <div className="space-y-4">
      {error && <Alert tone="error">{error}</Alert>}

      <Card flush>
        <div className="flex flex-col gap-3 border-b border-line px-5 py-4 lg:flex-row lg:items-center lg:justify-between">
          <Tabs
            label="Filter orders by status"
            value={selectedStatus}
            onChange={(value) => {
              setLoading(true);
              setSelectedStatus(value);
              setPage(1);
            }}
            items={STATUS_OPTIONS.map((o) => ({ value: o.value, label: o.label }))}
          />
          <div className="relative w-full lg:max-w-xs">
            <Search
              className="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-subtle"
              aria-hidden="true"
            />
            <Input
              aria-label="Search orders on this page"
              placeholder="Search tracking #, reference, recipient..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-9"
            />
          </div>
        </div>

        {loading ? (
          <div className="space-y-3 p-5" role="status" aria-label="Loading merchant orders...">
            {[1, 2, 3, 4, 5].map((i) => (
              <Skeleton key={i} className="h-10 w-full" />
            ))}
          </div>
        ) : (
          <Table
            bare
            columns={columns}
            rows={filteredOrders}
            rowKey={(row) => row.id}
            empty={
              <div className="p-5">
                <EmptyState
                  compact
                  className="border-0"
                  icon={<Package />}
                  title="No orders found"
                  description={
                    selectedStatus || searchTerm
                      ? 'Try adjusting your search filters or status selection.'
                      : 'Orders submitted via your partner API will appear here.'
                  }
                />
              </div>
            }
          />
        )}

        {total > 0 && (
          <CardFooter>
            <Pagination
              className="w-full"
              page={page}
              pageSize={pageSize}
              total={total}
              onPageChange={(next) => {
                setLoading(true);
                setPage(next);
              }}
            />
          </CardFooter>
        )}
      </Card>
    </div>
  );
}
