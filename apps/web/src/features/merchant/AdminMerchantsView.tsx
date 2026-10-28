'use client';

import { useEffect, useState } from 'react';
import {
  Alert,
  Button,
  EmptyState,
  FormField,
  Input,
  Select,
  Table,
  type Column,
} from '@/components/ui';
import { errorMessage } from '@/lib/api/errors';

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
  { value: '', label: 'All Merchants' },
  { value: 'PENDING', label: 'Pending Approval' },
  { value: 'APPROVED', label: 'Approved' },
  { value: 'REJECTED', label: 'Rejected' },
  { value: 'SUSPENDED', label: 'Suspended' },
];

async function fetchMerchants(status: string, signal?: AbortSignal): Promise<MerchantRecord[]> {
  const params = new URLSearchParams({ pageSize: '50' });
  if (status) params.set('status', status);

  const response = await fetch(`/api/v1/admin/merchants?${params.toString()}`, { signal });
  if (!response.ok) throw await response.json();

  const body: { data?: MerchantRecord[] } = await response.json();
  return body.data ?? [];
}

export function AdminMerchantsView() {
  const [merchants, setMerchants] = useState<MerchantRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  const [selectedStatus, setSelectedStatus] = useState<string>('PENDING');
  const [searchTerm, setSearchTerm] = useState('');

  // Rejection modal state
  const [rejectingId, setRejectingId] = useState<string | null>(null);
  const [rejectReason, setRejectReason] = useState('');
  const [actionLoading, setActionLoading] = useState(false);

  // Used after approve/reject/suspend actions to refresh the current filter.
  async function loadMerchants() {
    setLoading(true);
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
      header: 'Business Name',
      cell: (row) => <span className="font-semibold">{row.businessName}</span>,
    },
    {
      header: 'Contact Email',
      cell: (row) => <span>{row.contactEmail}</span>,
    },
    {
      header: 'Phone',
      cell: (row) => <span className="text-muted text-xs">{row.contactPhone || '—'}</span>,
    },
    {
      header: 'Status',
      cell: (row) => {
        const toneClasses =
          {
            PENDING: 'bg-amber-100 text-amber-800',
            APPROVED: 'bg-green-100 text-green-800',
            REJECTED: 'bg-red-100 text-red-800',
            SUSPENDED: 'bg-slate-200 text-slate-800',
          }[row.status] || 'bg-slate-100 text-slate-800';

        return (
          <span
            className={`inline-flex rounded-full px-2 py-0.5 text-xs font-semibold ${toneClasses}`}
          >
            {row.status}
          </span>
        );
      },
    },
    {
      header: 'Applied Date',
      cell: (row) => (
        <span className="text-xs text-muted">{new Date(row.createdAt).toLocaleDateString()}</span>
      ),
    },
    {
      header: 'Actions',
      cell: (row) => (
        <div className="flex items-center gap-1.5">
          {row.status === 'PENDING' && (
            <>
              <Button
                variant="primary"
                className="px-2 py-1 text-xs"
                disabled={actionLoading}
                onClick={() => handleApprove(row.id, row.businessName)}
              >
                Approve
              </Button>
              <Button
                variant="danger"
                className="px-2 py-1 text-xs"
                disabled={actionLoading}
                onClick={() => setRejectingId(row.id)}
              >
                Reject
              </Button>
            </>
          )}

          {row.status === 'APPROVED' && (
            <Button
              variant="danger"
              className="px-2 py-1 text-xs"
              disabled={actionLoading}
              onClick={() => handleSuspend(row.id, row.businessName)}
            >
              Suspend
            </Button>
          )}

          {row.status === 'SUSPENDED' && (
            <Button
              variant="secondary"
              className="px-2 py-1 text-xs"
              disabled={actionLoading}
              onClick={() => handleApprove(row.id, row.businessName)}
            >
              Re-approve
            </Button>
          )}

          {row.status === 'REJECTED' && (
            <Button
              variant="secondary"
              className="px-2 py-1 text-xs"
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

  return (
    <div className="space-y-4">
      {error && <Alert tone="error">{error}</Alert>}
      {successMsg && <Alert tone="success">{successMsg}</Alert>}

      {/* Reject Modal / Form */}
      {rejectingId && (
        <div className="rounded-lg border border-red-300 bg-red-50 p-4 space-y-3">
          <h3 className="font-semibold text-danger text-sm">Reject Merchant Application</h3>
          <form onSubmit={handleConfirmReject} className="space-y-3">
            <FormField label="Reason for rejection (Optional)" htmlFor="rejectReason">
              <Input
                id="rejectReason"
                placeholder="e.g. Invalid company registration number or incomplete KYC documents."
                value={rejectReason}
                onChange={(e) => setRejectReason(e.target.value)}
              />
            </FormField>
            <div className="flex justify-end gap-2">
              <Button
                type="button"
                variant="secondary"
                onClick={() => {
                  setRejectingId(null);
                  setRejectReason('');
                }}
              >
                Cancel
              </Button>
              <Button type="submit" variant="danger" disabled={actionLoading}>
                Confirm Rejection
              </Button>
            </div>
          </form>
        </div>
      )}

      {/* Filters row */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-1 items-center gap-2 max-w-sm">
          <Input
            placeholder="Search business name, email, phone..."
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
            }}
          >
            {STATUS_FILTERS.map((f) => (
              <option key={f.value} value={f.value}>
                {f.label}
              </option>
            ))}
          </Select>
        </div>
      </div>

      {/* Merchants Table */}
      {loading && (
        <p className="text-sm text-muted" role="status">
          Loading merchants...
        </p>
      )}
      <Table
        columns={columns}
        rows={filtered}
        rowKey={(m) => m.id}
        empty={
          <EmptyState
            title="No merchants found"
            description={
              selectedStatus
                ? `There are currently no merchants in ${selectedStatus} status.`
                : 'No merchants registered yet.'
            }
          />
        }
      />
    </div>
  );
}
