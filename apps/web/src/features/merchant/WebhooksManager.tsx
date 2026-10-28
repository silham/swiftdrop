'use client';

import { useEffect, useState } from 'react';
import { Alert, Button, Card, EmptyState, FormField, Input, Table, type Column } from '@/components/ui';
import { errorMessage } from '@/lib/api/errors';

interface WebhookItem {
  id: string;
  url: string;
  eventTypes: string[];
  isActive: boolean;
  createdAt: string;
}

interface WebhookAttemptItem {
  id: string;
  attemptNumber: number;
  status: 'PENDING' | 'SUCCEEDED' | 'FAILED' | 'DEAD';
  responseStatus?: number | null;
  errorMessage?: string | null;
  durationMs?: number | null;
  createdAt: string;
}

export function WebhooksManager() {
  const [endpoints, setEndpoints] = useState<WebhookItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Endpoint form state
  const [isAdding, setIsAdding] = useState(false);
  const [url, setUrl] = useState('');
  const [submitting, setSubmitting] = useState(false);

  // One-time secret display
  const [secretToDisplay, setSecretToDisplay] = useState<{
    secret: string;
    endpointUrl: string;
    isRotated?: boolean;
  } | null>(null);
  const [copied, setCopied] = useState(false);

  // Delivery attempts view
  const [selectedEndpoint, setSelectedEndpoint] = useState<WebhookItem | null>(null);
  const [attempts, setAttempts] = useState<WebhookAttemptItem[]>([]);
  const [loadingAttempts, setLoadingAttempts] = useState(false);

  async function loadEndpoints() {
    try {
      setLoading(true);
      const res = await fetch('/api/v1/merchants/me/webhooks');
      if (!res.ok) throw await res.json();
      const data = await res.json();
      setEndpoints(data);
    } catch (err) {
      setError(errorMessage(err, 'Failed to load webhook endpoints'));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadEndpoints();
  }, []);

  async function handleCreateEndpoint(e: React.FormEvent) {
    e.preventDefault();
    if (!url.trim()) return;

    try {
      setSubmitting(true);
      setError(null);
      const res = await fetch('/api/v1/merchants/me/webhooks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          url: url.trim(),
          eventTypes: ['parcel.status_changed'],
        }),
      });

      if (!res.ok) throw await res.json();
      const created = await res.json();

      setSecretToDisplay({
        secret: created.secret,
        endpointUrl: created.url,
      });
      setUrl('');
      setIsAdding(false);
      await loadEndpoints();
    } catch (err) {
      setError(errorMessage(err, 'Failed to create webhook endpoint'));
    } finally {
      setSubmitting(false);
    }
  }

  async function handleRotateSecret(endpoint: WebhookItem) {
    if (
      !confirm(
        `Are you sure you want to rotate the signing secret for ${endpoint.url}? The previous secret will only remain valid for a brief grace period.`,
      )
    ) {
      return;
    }

    try {
      const res = await fetch(`/api/v1/merchants/me/webhooks/${endpoint.id}/rotate-secret`, {
        method: 'POST',
      });
      if (!res.ok) throw await res.json();
      const data = await res.json();

      setSecretToDisplay({
        secret: data.secret,
        endpointUrl: endpoint.url,
        isRotated: true,
      });
    } catch (err) {
      setError(errorMessage(err, 'Failed to rotate secret'));
    }
  }

  async function handleToggleActive(endpoint: WebhookItem) {
    try {
      const res = await fetch(`/api/v1/merchants/me/webhooks/${endpoint.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ isActive: !endpoint.isActive }),
      });
      if (!res.ok) throw await res.json();
      await loadEndpoints();
    } catch (err) {
      setError(errorMessage(err, 'Failed to toggle status'));
    }
  }

  async function handleDelete(id: string) {
    if (!confirm('Are you sure you want to delete this webhook endpoint?')) return;
    try {
      const res = await fetch(`/api/v1/merchants/me/webhooks/${id}`, {
        method: 'DELETE',
      });
      if (!res.ok) throw await res.json();
      if (selectedEndpoint?.id === id) {
        setSelectedEndpoint(null);
      }
      await loadEndpoints();
    } catch (err) {
      setError(errorMessage(err, 'Failed to delete webhook'));
    }
  }

  async function handleViewAttempts(endpoint: WebhookItem) {
    setSelectedEndpoint(endpoint);
    try {
      setLoadingAttempts(true);
      const res = await fetch(`/api/v1/merchants/me/webhooks/${endpoint.id}/attempts`);
      if (!res.ok) throw await res.json();
      const data = await res.json();
      setAttempts(data);
    } catch (err) {
      setError(errorMessage(err, 'Failed to fetch delivery attempts'));
    } finally {
      setLoadingAttempts(false);
    }
  }

  function copyToClipboard(text: string) {
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2500);
  }

  const columns: Column<WebhookItem>[] = [
    {
      header: 'Endpoint URL',
      cell: (row) => <span className="font-mono text-sm break-all">{row.url}</span>,
    },
    {
      header: 'Subscribed Events',
      cell: (row) => (
        <div className="flex flex-wrap gap-1">
          {row.eventTypes.map((t) => (
            <span
              key={t}
              className="inline-flex rounded bg-canvas px-1.5 py-0.5 text-xs font-mono text-muted"
            >
              {t}
            </span>
          ))}
        </div>
      ),
    },
    {
      header: 'Status',
      cell: (row) =>
        row.isActive ? (
          <span className="inline-flex rounded-full bg-green-100 px-2 py-0.5 text-xs font-medium text-green-700">
            Active
          </span>
        ) : (
          <span className="inline-flex rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-600">
            Inactive
          </span>
        ),
    },
    {
      header: 'Actions',
      cell: (row) => (
        <div className="flex items-center gap-1.5">
          <Button
            variant="secondary"
            className="px-2 py-1 text-xs"
            onClick={() => handleViewAttempts(row)}
          >
            Attempts
          </Button>
          <Button
            variant="secondary"
            className="px-2 py-1 text-xs"
            onClick={() => handleRotateSecret(row)}
          >
            Rotate Secret
          </Button>
          <Button
            variant="secondary"
            className="px-2 py-1 text-xs"
            onClick={() => handleToggleActive(row)}
          >
            {row.isActive ? 'Disable' : 'Enable'}
          </Button>
          <Button
            variant="danger"
            className="px-2 py-1 text-xs"
            onClick={() => handleDelete(row.id)}
          >
            Delete
          </Button>
        </div>
      ),
    },
  ];

  return (
    <div className="space-y-6">
      {error && <Alert tone="error">{error}</Alert>}

      {/* Secret Display Banner */}
      {secretToDisplay && (
        <div className="rounded-lg border-2 border-brand bg-brand-soft/20 p-5 space-y-3">
          <div className="flex items-start justify-between">
            <div>
              <h3 className="font-semibold text-brand-dark text-base">
                {secretToDisplay.isRotated
                  ? 'Webhook Secret Rotated'
                  : 'Webhook Signing Secret Generated'}
              </h3>
              <p className="text-xs text-muted mt-0.5">
                Save this HMAC signing secret for <strong>{secretToDisplay.endpointUrl}</strong> now.
                It will <strong>never be shown again</strong>. Use it to verify the{' '}
                <code className="font-mono">X-SwiftDrop-Signature</code> header.
              </p>
            </div>
            <button
              onClick={() => setSecretToDisplay(null)}
              className="text-xs text-muted hover:text-ink font-medium"
            >
              Dismiss ✕
            </button>
          </div>

          <div className="flex items-center gap-2">
            <input
              type="text"
              readOnly
              value={secretToDisplay.secret}
              className="w-full rounded border border-line bg-surface px-3 py-2 font-mono text-sm select-all outline-none"
            />
            <Button
              variant="primary"
              onClick={() => copyToClipboard(secretToDisplay.secret)}
              className="whitespace-nowrap"
            >
              {copied ? '✓ Copied!' : 'Copy Secret'}
            </Button>
          </div>
        </div>
      )}

      {/* Action Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-base font-semibold">Configured Webhook Endpoints</h2>
          <p className="text-xs text-muted">
            SwiftDrop delivers automated event notifications to these HTTP POST URLs.
          </p>
        </div>
        {!isAdding && (
          <Button variant="primary" onClick={() => setIsAdding(true)}>
            + Add Endpoint
          </Button>
        )}
      </div>

      {/* Add Endpoint Form */}
      {isAdding && (
        <Card className="p-4 space-y-3 border-brand">
          <h3 className="text-sm font-semibold">Add New Webhook Receiver</h3>
          <form onSubmit={handleCreateEndpoint} className="space-y-3">
            <FormField
              label="Endpoint URL"
              htmlFor="url"
              help="Must use HTTPS in production (HTTP allowed for local testing)."
            >
              <Input
                id="url"
                type="url"
                placeholder="https://your-domain.com/api/webhooks/swiftdrop"
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                required
              />
            </FormField>

            <div className="flex gap-2 justify-end pt-1">
              <Button
                type="button"
                variant="secondary"
                onClick={() => {
                  setIsAdding(false);
                  setUrl('');
                }}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={submitting}>
                {submitting ? 'Registering...' : 'Register Endpoint'}
              </Button>
            </div>
          </form>
        </Card>
      )}

      {/* Endpoints Table */}
      <Table
        columns={columns}
        rows={endpoints}
        rowKey={(e) => e.id}
        empty={
          <EmptyState
            title="No Webhook Endpoints"
            description="You haven't configured any webhook endpoints to receive delivery updates."
            action={
              <Button variant="primary" onClick={() => setIsAdding(true)}>
                Add First Endpoint
              </Button>
            }
          />
        }
      />

      {/* Delivery Attempts Modal/Drawer */}
      {selectedEndpoint && (
        <Card className="p-4 space-y-3 bg-canvas">
          <div className="flex items-center justify-between border-b border-line pb-2">
            <div>
              <h3 className="font-semibold text-sm">
                Delivery Attempts for: <span className="font-mono">{selectedEndpoint.url}</span>
              </h3>
              <p className="text-xs text-muted">Recent delivery payloads and response codes.</p>
            </div>
            <Button
              variant="secondary"
              className="text-xs py-1"
              onClick={() => setSelectedEndpoint(null)}
            >
              Close
            </Button>
          </div>

          {loadingAttempts ? (
            <p className="text-sm text-muted py-4 text-center">Loading delivery history...</p>
          ) : attempts.length === 0 ? (
            <p className="text-sm text-muted py-4 text-center">
              No delivery attempts recorded for this endpoint yet.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-line text-xs">
                <thead>
                  <tr className="text-left text-muted">
                    <th className="py-2 px-3">Attempt</th>
                    <th className="py-2 px-3">Status</th>
                    <th className="py-2 px-3">HTTP Code</th>
                    <th className="py-2 px-3">Duration</th>
                    <th className="py-2 px-3">Time</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line">
                  {attempts.map((att) => (
                    <tr key={att.id} className="hover:bg-surface">
                      <td className="py-2 px-3 font-mono">#{att.attemptNumber}</td>
                      <td className="py-2 px-3">
                        <span
                          className={`inline-flex rounded px-1.5 py-0.5 font-medium ${
                            att.status === 'SUCCEEDED'
                              ? 'bg-green-100 text-green-800'
                              : att.status === 'FAILED'
                                ? 'bg-red-100 text-red-800'
                                : 'bg-slate-100 text-slate-800'
                          }`}
                        >
                          {att.status}
                        </span>
                      </td>
                      <td className="py-2 px-3 font-mono">{att.responseStatus ?? '—'}</td>
                      <td className="py-2 px-3">{att.durationMs ? `${att.durationMs}ms` : '—'}</td>
                      <td className="py-2 px-3 text-muted">
                        {new Date(att.createdAt).toLocaleString()}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      )}
    </div>
  );
}

