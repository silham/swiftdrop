'use client';

import { Search, Store } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import {
  Alert,
  Avatar,
  Badge,
  Button,
  Card,
  CardHeader,
  EmptyState,
  FormField,
  Input,
  Modal,
  Skeleton,
  Table,
  Tabs,
  Toolbar,
  type BadgeTone,
  type Column,
} from '@/components/ui';
import { errorMessage } from '@/lib/api/errors';
import { formatDate } from '@/lib/format';

interface MerchantRecord {
  id: string;
  businessName: string;
  contactEmail: string;
  contactPhone?: string | null;
  status: 'PENDING' | 'APPROVED' | 'REJECTED' | 'SUSPENDED';
  approvedAt?: string | null;
  approvedById?: string | null;
  createdAt: string;
}

const STATUS_FILTERS = [
  { value: 'PENDING', label: 'Pending' },
  { value: 'APPROVED', label: 'Approved' },
  { value: 'REJECTED', label: 'Rejected' },
  { value: 'SUSPENDED', label: 'Suspended' },
  { value: '', label: 'All' },
];

const STATUS_TONE: Record<MerchantRecord['status'], BadgeTone> = {
  PENDING: 'warning',
  APPROVED: 'success',
  REJECTED: 'danger',
  SUSPENDED: 'neutral',
};

const STATUS_TEXT: Record<MerchantRecord['status'], string> = {
  PENDING: 'Pending',
  APPROVED: 'Approved',
  REJECTED: 'Rejected',
  SUSPENDED: 'Suspended',
};

type Counts = Partial<Record<string, number>>;

/** Per-status totals for the tab badges: one pageSize=1 request per status, reading meta.total. */
async function fetchCounts(signal?: AbortSignal): Promise<Counts> {
  const entries = await Promise.all(
    ['PENDING', 'APPROVED', 'REJECTED', 'SUSPENDED'].map(async (status) => {
      const res = await fetch(`/api/v1/admin/merchants?status=${status}&pageSize=1`, { signal });
      if (!res.ok) return [status, undefined] as const;
      const body: { meta?: { total?: number } } = await res.json();
      return [status, body.meta?.total] as const;
    }),
  );
  const counts: Counts = Object.fromEntries(entries);
  const known = entries.map(([, n]) => n).filter((n): n is number => n != null);
  if (known.length === entries.length) counts[''] = known.reduce((a, b) => a + b, 0);
  return counts;
}

async function fetchMerchants(status: string, signal?: AbortSignal): Promise<MerchantRecord[]> {
  const params = new URLSearchParams({ pageSize: '50' });
  if (status) params.set('status', status);

  const response = await fetch(`/api/v1/admin/merchants?${params.toString()}`, { signal });
  if (!response.ok) throw await response.json();

  const body: { data?: MerchantRecord[] } = await response.json();
  return body.data ?? [];
}

export function AdminMerchantsView({ initialStatus = 'PENDING' }: { initialStatus?: string }) {
  const [merchants, setMerchants] = useState<MerchantRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  const [selectedStatus, setSelectedStatus] = useState<string>(initialStatus);
  const [counts, setCounts] = useState<Counts>({});
  const [searchTerm, setSearchTerm] = useState('');

  // Rejection modal state
  const [rejectingId, setRejectingId] = useState<string | null>(null);
  const [rejectReason, setRejectReason] = useState('');
  const [actionLoading, setActionLoading] = useState(false);

  const refreshCounts = useCallback((signal?: AbortSignal) => {
    void fetchCounts(signal)
      .then((c) => {
        if (!signal?.aborted) setCounts(c);
      })
      .catch(() => undefined);
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    refreshCounts(controller.signal);
    return () => controller.abort();
  }, [refreshCounts]);

  // Used after approve/reject/suspend actions to refresh the current filter.
  async function loadMerchants() {
    setLoading(true);
    refreshCounts();
    try {
      const data = await fetchMerchants(selectedStatus);
      setMerchants(data);
      setError(null);
    } catch (err) {
      setError(errorMessage(err, 'Failed to load merchants'));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    const controller = new AbortController();

    // Asynchronous completion updates state; no synchronous state writes in the effect.
    void fetchMerchants(selectedStatus, controller.signal)
      .then((data) => {
        if (controller.signal.aborted) return;
        setMerchants(data);
        setError(null);
      })
      .catch((err: unknown) => {
        if (!controller.signal.aborted) {
          setError(errorMessage(err, 'Failed to load merchants'));
        }
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });

    return () => controller.abort();
  }, [selectedStatus]);

  async function handleApprove(id: string, name: string) {
    if (
      !confirm(
        `Are you sure you want to approve "${name}"? This allows them to use the partner API.`,
      )
    ) {
      return;
    }

    try {
      setActionLoading(true);
      setError(null);
      const res = await fetch(`/api/v1/admin/merchants/${id}/approve`, {
        method: 'POST',
      });
      if (!res.ok) throw await res.json();

      setSuccessMsg(`Merchant "${name}" successfully approved.`);
      await loadMerchants();
      setTimeout(() => setSuccessMsg(null), 4000);
    } catch (err) {
      setError(errorMessage(err, 'Failed to approve merchant'));
    } finally {
      setActionLoading(false);
    }
  }

  async function handleConfirmReject(e: React.FormEvent) {
    e.preventDefault();
    if (!rejectingId) return;

    try {
      setActionLoading(true);
      setError(null);
      const res = await fetch(`/api/v1/admin/merchants/${rejectingId}/reject`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reason: rejectReason.trim() || undefined }),
      });
      if (!res.ok) throw await res.json();

      setSuccessMsg('Merchant application has been rejected.');
      setRejectingId(null);
      setRejectReason('');
      await loadMerchants();
      setTimeout(() => setSuccessMsg(null), 4000);
    } catch (err) {
      setError(errorMessage(err, 'Failed to reject merchant'));
    } finally {
      setActionLoading(false);
    }
  }

  async function handleSuspend(id: string, name: string) {
    if (
      !confirm(
        `Are you sure you want to suspend "${name}"? Their API keys will be rejected immediately.`,
      )
    ) {
      return;
    }

    try {
      setActionLoading(true);
      setError(null);
      const res = await fetch(`/api/v1/admin/merchants/${id}/suspend`, {
        method: 'POST',
      });
      if (!res.ok) throw await res.json();

      setSuccessMsg(`Merchant "${name}" has been suspended.`);
      await loadMerchants();
      setTimeout(() => setSuccessMsg(null), 4000);
    } catch (err) {
      setError(errorMessage(err, 'Failed to suspend merchant'));
    } finally {
      setActionLoading(false);
    }
  }

  const filtered = merchants.filter((m) => {
    if (!searchTerm.trim()) return true;
    const term = searchTerm.toLowerCase();
    return (
      m.businessName.toLowerCase().includes(term) ||
      m.contactEmail.toLowerCase().includes(term) ||
      (m.contactPhone && m.contactPhone.toLowerCase().includes(term))
    );
  });

  const columns: Column<MerchantRecord>[] = [
    {
      header: 'Business',
      cell: (row) => (
        <div className="flex items-center gap-3">
          <Avatar name={row.businessName.replace(/[^\p{L}\p{N}\s]/gu, '')} size="sm" />
          <div className="min-w-0">
            <div className="truncate font-medium text-ink">{row.businessName}</div>
            <div className="truncate text-xs text-muted">{row.contactEmail}</div>
          </div>
        </div>
      ),
    },
    {
      header: 'Phone',
      cell: (row) => (
        <span className="text-xs text-muted tabular-nums">{row.contactPhone || '—'}</span>
      ),
    },
    {
      header: 'Status',
      cell: (row) => (
        <Badge tone={STATUS_TONE[row.status] ?? 'neutral'} dot>
          {STATUS_TEXT[row.status] ?? row.status}
        </Badge>
      ),
    },
    {
      header: 'Applied',
      cell: (row) => <span className="text-xs text-muted">{formatDate(row.createdAt)}</span>,
    },
    {
      header: 'Actions',
      headerClassName: 'text-right',
      className: 'px-4 py-3 text-right',
      cell: (row) => (
        <div className="flex items-center justify-end gap-1.5">
          {row.status === 'PENDING' && (
            <>
              <Button
                variant="primary"
                size="sm"
                disabled={actionLoading}
                onClick={() => handleApprove(row.id, row.businessName)}
              >
                Approve
              </Button>
              <Button
                variant="secondary"
                size="sm"
                className="text-danger"
                disabled={actionLoading}
                onClick={() => setRejectingId(row.id)}
              >
                Reject
              </Button>
            </>
          )}

          {row.status === 'APPROVED' && (
            <Button
              variant="secondary"
              size="sm"
              className="text-danger"
              disabled={actionLoading}
              onClick={() => handleSuspend(row.id, row.businessName)}
            >
              Suspend
            </Button>
          )}

          {row.status === 'SUSPENDED' && (
            <Button
              variant="secondary"
              size="sm"
              disabled={actionLoading}
              onClick={() => handleApprove(row.id, row.businessName)}
            >
              Re-approve
            </Button>
          )}

          {row.status === 'REJECTED' && (
            <Button
              variant="secondary"
              size="sm"
              disabled={actionLoading}
              onClick={() => handleApprove(row.id, row.businessName)}
            >
              Approve
            </Button>
          )}
        </div>
      ),
    },
  ];

  const rejecting = merchants.find((m) => m.id === rejectingId);
  const closeReject = () => {
    setRejectingId(null);
    setRejectReason('');
  };

  return (
    <div className="space-y-4">
      {error && <Alert tone="error">{error}</Alert>}
      {successMsg && <Alert tone="success">{successMsg}</Alert>}

      <Modal
        open={rejectingId != null}
        onClose={closeReject}
        title="Reject Merchant Application"
        titleAs="h3"
        description={
          rejecting
            ? `"${rejecting.businessName}" will be notified and cannot use the partner API.`
            : undefined
        }
        footer={
          <>
            <Button type="button" variant="secondary" onClick={closeReject}>
              Cancel
            </Button>
            <Button
              type="submit"
              form="reject-merchant-form"
              variant="danger"
              disabled={actionLoading}
            >
              Confirm Rejection
            </Button>
          </>
        }
      >
        <form id="reject-merchant-form" onSubmit={handleConfirmReject}>
          <FormField label="Reason for rejection (Optional)" htmlFor="rejectReason">
            <Input
              id="rejectReason"
              data-autofocus
              placeholder="e.g. Invalid company registration number or incomplete KYC documents."
              value={rejectReason}
              onChange={(e) => setRejectReason(e.target.value)}
            />
          </FormField>
        </form>
      </Modal>

      <Card flush>
        <CardHeader
          title="Merchant accounts"
          description="Approve new partners, reject incomplete applications or suspend access."
          icon={<Store />}
        />
        <div className="border-b border-line px-5 py-3">
          <Toolbar
            end={
              <div className="relative w-full sm:w-72">
                <Search
                  className="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-subtle"
                  aria-hidden="true"
                />
                <Input
                  type="search"
                  aria-label="Search merchants"
                  placeholder="Search business name, email, phone..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-9"
                />
              </div>
            }
          >
            <Tabs
              label="Filter by status"
              value={selectedStatus}
              onChange={(value) => {
                setLoading(true);
                setSelectedStatus(value);
              }}
              items={STATUS_FILTERS.map((f) => ({
                value: f.value,
                label: f.label,
                count: counts[f.value],
              }))}
            />
          </Toolbar>
        </div>

        {loading ? (
          <div className="space-y-3 p-5" role="status" aria-label="Loading merchants">
            {[1, 2, 3].map((i) => (
              <Skeleton key={i} className="h-10 w-full" />
            ))}
          </div>
        ) : (
          <Table
            bare
            caption="Merchants"
            columns={columns}
            rows={filtered}
            rowKey={(m) => m.id}
            empty={
              <div className="p-5">
                <EmptyState
                  compact
                  icon={<Store />}
                  title="No merchants found"
                  description={
                    searchTerm.trim()
                      ? 'No merchants match your search.'
                      : selectedStatus
                        ? `There are currently no merchants in ${STATUS_TEXT[selectedStatus as MerchantRecord['status']]?.toLowerCase() ?? selectedStatus} status.`
                        : 'No merchants registered yet.'
                  }
                />
              </div>
            }
          />
        )}
      </Card>
    </div>
  );
}
