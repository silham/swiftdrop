'use client';

import { useEffect, useState } from 'react';
import { Alert, Button, EmptyState, Input, Select, StatusBadge, Table, type Column } from '@/components/ui';
import { errorMessage } from '@/lib/api/errors';

interface ParcelItem {
  id: string;
  trackingNumber: string;
  merchantReference?: string;
  status: any;
  senderName: string;
  recipientName: string;
  dropoffCity: string;
  feeCents: number;
  currency: string;
  createdAt: string;
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
  const [pageSize] = useState(10);
  const [selectedStatus, setSelectedStatus] = useState('');
  const [searchTerm, setSearchTerm] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  async function loadOrders() {
    try {
      setLoading(true);
      const params = new URLSearchParams({
        page: String(page),
        pageSize: String(pageSize),
      });
      if (selectedStatus) {
        params.set('status', selectedStatus);
      }

      const res = await fetch(`/api/v1/merchants/me/parcels?${params.toString()}`);
      if (!res.ok) throw await res.json();
      const body = await res.json();

      setOrders(body.data ?? []);
      setTotal(body.meta?.total ?? 0);
    } catch (err) {
      setError(errorMessage(err, 'Failed to load merchant orders'));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadOrders();
  }, [page, selectedStatus]);

  const filteredOrders = orders.filter((o) => {
    if (!searchTerm.trim()) return true;
    const term = searchTerm.toLowerCase();
    return (
      o.trackingNumber.toLowerCase().includes(term) ||
      (o.merchantReference && o.merchantReference.toLowerCase().includes(term)) ||
      o.recipientName.toLowerCase().includes(term)
    );
  });

  const totalPages = Math.ceil(total / pageSize) || 1;

  const columns: Column<ParcelItem>[] = [
    {
      header: 'Tracking #',
      cell: (row) => (
        <span className="font-mono font-medium text-brand">{row.trackingNumber}</span>
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
        <span className="text-xs text-muted">
          {new Date(row.createdAt).toLocaleDateString()}
        </span>
      ),
    },
  ];

  return (
    <div className="space-y-4">
      {error && <Alert tone="error">{error}</Alert>}

      {/* Filters row */}
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
              setSelectedStatus(e.target.value);
              setPage(1);
            }}
          >
            {STATUS_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </Select>
        </div>
      </div>

      {/* Table */}
      <Table
        columns={columns}
        rows={filteredOrders}
        rowKey={(r) => r.id}
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

      {/* Pagination Controls */}
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
              onClick={() => setPage((p) => Math.max(1, p - 1))}
            >
              Previous
            </Button>
            <Button
              variant="secondary"
              className="px-3 py-1 text-xs"
              disabled={page >= totalPages || loading}
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
            >
              Next
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

