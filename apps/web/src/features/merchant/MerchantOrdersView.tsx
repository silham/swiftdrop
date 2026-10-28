'use client';

import { useEffect, useState, type ComponentProps } from 'react';
import {
  Alert,
  Button,
  EmptyState,
  Input,
  Select,
  StatusBadge,
  Table,
  type Column,
} from '@/components/ui';
import { errorMessage } from '@/lib/api/errors';

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
  { value: '', label: 'All Statuses' },
  { value: 'CREATED', label: 'Created' },
  { value: 'PICKED_UP', label: 'Picked up' },
  { value: 'IN_TRANSIT', label: 'In transit' },
  { value: 'OUT_FOR_DELIVERY', label: 'Out for delivery' },
  { value: 'DELIVERED', label: 'Delivered' },
  { value: 'FAILED', label: 'Failed' },
];

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

  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  const columns: Column<ParcelItem>[] = [
    {
      header: 'Tracking #',
      cell: (row) => <span className="font-mono font-medium text-brand">{row.trackingNumber}</span>,
    },
    {
      header: 'Your Reference',
      cell: (row) => (
        <span className="font-mono text-xs text-muted">{row.merchantReference || '—'}</span>
      ),
    },
    {
      header: 'Recipient',
      cell: (row) => <span className="font-medium">{row.recipientName}</span>,
    },
    {
      header: 'Destination',
      cell: (row) => <span className="capitalize">{row.dropoffCity}</span>,
    },
    {
      header: 'Fee',
      cell: (row) => (
        <span className="font-mono text-xs">
          {row.currency} {(row.feeCents / 100).toFixed(2)}
        </span>
      ),
    },
    {
      header: 'Status',
      cell: (row) => <StatusBadge status={row.status} />,
    },
    {
      header: 'Created',
      cell: (row) => (
        <span className="text-xs text-muted">{new Date(row.createdAt).toLocaleDateString()}</span>
      ),
    },
  ];

  return (
    <div className="space-y-4">
      {error && <Alert tone="error">{error}</Alert>}
      {loading && (
        <p className="text-sm text-muted" role="status">
          Loading merchant orders...
        </p>
      )}

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-1 items-center gap-2 max-w-sm">
          <Input
            placeholder="Search tracking #, reference, recipient..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>
        <div className="flex items-center gap-2">
          <Select
            value={selectedStatus}
            onChange={(e) => {
              setLoading(true);
              setSelectedStatus(e.target.value);
              setPage(1);
            }}
          >
            {STATUS_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </Select>
        </div>
      </div>

      {!loading && (
        <Table
          columns={columns}
          rows={filteredOrders}
          rowKey={(row) => row.id}
          empty={
            <EmptyState
              title="No orders found"
              description={
                selectedStatus || searchTerm
                  ? 'Try adjusting your search filters or status selection.'
                  : 'Orders submitted via your partner API will appear here.'
              }
            />
          }
        />
      )}

      {totalPages > 1 && (
        <div className="flex items-center justify-between pt-2">
          <p className="text-xs text-muted">
            Showing Page {page} of {totalPages} ({total} total orders)
          </p>
          <div className="flex gap-2">
            <Button
              variant="secondary"
              className="px-3 py-1 text-xs"
              disabled={page <= 1 || loading}
              onClick={() => {
                setLoading(true);
                setPage((current) => Math.max(1, current - 1));
              }}
            >
              Previous
            </Button>
            <Button
              variant="secondary"
              className="px-3 py-1 text-xs"
              disabled={page >= totalPages || loading}
              onClick={() => {
                setLoading(true);
                setPage((current) => Math.min(totalPages, current + 1));
              }}
            >
              Next
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
