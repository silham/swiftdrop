'use client';

import { Plus, Webhook } from 'lucide-react';
import { useEffect, useState } from 'react';
import {
  Alert,
  Badge,
  Button,
  Card,
  CardBody,
  CardHeader,
  Drawer,
  EmptyState,
  FormField,
  Input,
  Skeleton,
  Table,
  type BadgeTone,
  type Column,
} from '@/components/ui';
import { errorMessage } from '@/lib/api/errors';
import { formatDateTime } from '@/lib/format';
import { SecretReveal } from './SecretReveal';

const ATTEMPT_TONE: Record<string, BadgeTone> = {
  SUCCEEDED: 'success',
  FAILED: 'warning',
  DEAD: 'danger',
  PENDING: 'neutral',
};

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

const ATTEMPTS_PAGE_SIZE = 20;

/** Owner: M5. Webhook endpoints, signing-secret rotation and delivery attempts. */
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

  // Delivery attempts view
  const [selectedEndpoint, setSelectedEndpoint] = useState<WebhookItem | null>(null);
  const [attempts, setAttempts] = useState<WebhookAttemptItem[]>([]);
  const [attemptsTotal, setAttemptsTotal] = useState(0);
  const [attemptsPage, setAttemptsPage] = useState(1);
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
    const controller = new AbortController();

    async function fetchInitialEndpoints() {
      try {
        const res = await fetch('/api/v1/merchants/me/webhooks', {
          signal: controller.signal,
        });
        if (!res.ok) throw await res.json();
        const data: WebhookItem[] = await res.json();
        if (!controller.signal.aborted) {
          setEndpoints(data);
        }
      } catch (err) {
        if (!controller.signal.aborted) {
          setError(errorMessage(err, 'Failed to load webhook endpoints'));
        }
      } finally {
        if (!controller.signal.aborted) {
          setLoading(false);
        }
      }
    }

    void fetchInitialEndpoints();
    return () => controller.abort();
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

  /** Loads one page of attempts. Page 1 replaces the list, later pages are appended. */
  async function loadAttempts(endpoint: WebhookItem, page: number) {
    try {
      setLoadingAttempts(true);
      const res = await fetch(
        `/api/v1/merchants/me/webhooks/${endpoint.id}/attempts?page=${page}&pageSize=${ATTEMPTS_PAGE_SIZE}`,
      );
      if (!res.ok) throw await res.json();
      const data: WebhookAttemptItem[] = await res.json();
      setAttemptsTotal(Number(res.headers.get('X-Total-Count') ?? data.length));
      setAttemptsPage(page);
      setAttempts((prev) => (page === 1 ? data : [...prev, ...data]));
    } catch (err) {
      setError(errorMessage(err, 'Failed to fetch delivery attempts'));
    } finally {
      setLoadingAttempts(false);
    }
  }

  async function handleViewAttempts(endpoint: WebhookItem) {
    setSelectedEndpoint(endpoint);
    setAttempts([]);
    setAttemptsTotal(0);
    await loadAttempts(endpoint, 1);
  }

  const columns: Column<WebhookItem>[] = [
    {
      header: 'Endpoint URL',
      cell: (row) => <span className="font-mono text-[13px] break-all text-ink">{row.url}</span>,
    },
    {
      header: 'Subscribed Events',
      cell: (row) => (
        <div className="flex flex-wrap gap-1">
          {row.eventTypes.map((t) => (
            <Badge key={t} className="font-mono">
              {t}
            </Badge>
          ))}
        </div>
      ),
    },
    {
      header: 'Status',
      cell: (row) =>
        row.isActive ? (
          <Badge tone="success" dot>
            Active
          </Badge>
        ) : (
          <Badge tone="neutral" dot>
            Inactive
          </Badge>
        ),
    },
    {
      header: 'Actions',
      headerClassName: 'text-right',
      className: 'px-4 py-3',
      cell: (row) => (
        <div className="flex flex-wrap items-center justify-end gap-1.5">
          <Button variant="secondary" size="sm" onClick={() => handleViewAttempts(row)}>
            Attempts
          </Button>
          <Button variant="secondary" size="sm" onClick={() => handleRotateSecret(row)}>
            Rotate Secret
          </Button>
          <Button variant="secondary" size="sm" onClick={() => handleToggleActive(row)}>
            {row.isActive ? 'Disable' : 'Enable'}
          </Button>
          <Button variant="danger" size="sm" onClick={() => handleDelete(row.id)}>
            Delete
          </Button>
        </div>
      ),
    },
  ];

  const attemptColumns: Column<WebhookAttemptItem>[] = [
    { header: 'Attempt', cell: (a) => <span className="font-mono">#{a.attemptNumber}</span> },
    {
      header: 'Status',
      cell: (a) => (
        <Badge tone={ATTEMPT_TONE[a.status] ?? 'neutral'} dot>
          {a.status}
        </Badge>
      ),
    },
    {
      header: 'HTTP Code',
      cell: (a) => <span className="font-mono">{a.responseStatus ?? '—'}</span>,
    },
    {
      header: 'Duration',
      cell: (a) => <span className="tabular-nums">{a.durationMs ? `${a.durationMs}ms` : '—'}</span>,
    },
    {
      header: 'Time',
      cell: (a) => <span className="text-xs text-muted">{formatDateTime(a.createdAt)}</span>,
    },
  ];

  return (
    <div className="space-y-6">
      {error && <Alert tone="error">{error}</Alert>}

      {secretToDisplay && (
        <SecretReveal
          title={
            secretToDisplay.isRotated
              ? 'Webhook Secret Rotated'
              : 'Webhook Signing Secret Generated'
          }
          value={secretToDisplay.secret}
          copyLabel="Copy Secret"
          onDismiss={() => setSecretToDisplay(null)}
        >
          Save this HMAC signing secret for{' '}
          <strong className="break-all text-ink">{secretToDisplay.endpointUrl}</strong> now. It will{' '}
          <strong className="text-ink">never be shown again</strong>. Use it to verify the{' '}
          <code className="font-mono">X-SwiftDrop-Signature</code> header.
        </SecretReveal>
      )}

      {isAdding && (
        <Card flush className="ring-2 ring-brand/30">
          <CardHeader
            title="Add New Webhook Receiver"
            titleAs="h3"
            icon={<Webhook />}
            description="We POST signed parcel.status_changed events to this URL."
          />
          <CardBody>
            <form onSubmit={handleCreateEndpoint} className="space-y-4">
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
                  autoFocus
                />
              </FormField>

              <div className="flex justify-end gap-2">
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
          </CardBody>
        </Card>
      )}

      <Card flush>
        <CardHeader
          title="Configured Webhook Endpoints"
          description="SwiftDrop delivers automated event notifications to these HTTP POST URLs."
          actions={
            !isAdding && (
              <Button variant="primary" size="sm" onClick={() => setIsAdding(true)}>
                <Plus className="h-4 w-4" aria-hidden="true" /> Add Endpoint
              </Button>
            )
          }
        />
        {loading ? (
          <div className="space-y-3 p-5" role="status" aria-label="Loading webhook endpoints...">
            {[1, 2].map((i) => (
              <Skeleton key={i} className="h-10 w-full" />
            ))}
          </div>
        ) : (
          <Table
            bare
            columns={columns}
            rows={endpoints}
            rowKey={(e) => e.id}
            empty={
              <div className="p-5">
                <EmptyState
                  compact
                  className="border-0"
                  icon={<Webhook />}
                  title="No Webhook Endpoints"
                  description="You haven't configured any webhook endpoints to receive delivery updates."
                  action={
                    <Button variant="primary" onClick={() => setIsAdding(true)}>
                      Add First Endpoint
                    </Button>
                  }
                />
              </div>
            }
          />
        )}
      </Card>

      <Drawer
        open={selectedEndpoint !== null}
        onClose={() => setSelectedEndpoint(null)}
        title="Delivery Attempts"
        titleAs="h3"
        description={
          selectedEndpoint && (
            <>
              Recent delivery payloads and response codes for{' '}
              <span className="font-mono break-all text-ink">{selectedEndpoint.url}</span>
            </>
          )
        }
        footer={
          <Button variant="secondary" onClick={() => setSelectedEndpoint(null)}>
            Close
          </Button>
        }
      >
        {loadingAttempts && attempts.length === 0 ? (
          <div className="space-y-3" role="status" aria-label="Loading delivery history...">
            {[1, 2, 3].map((i) => (
              <Skeleton key={i} className="h-9 w-full" />
            ))}
          </div>
        ) : attempts.length === 0 ? (
          <EmptyState
            compact
            title="No attempts yet"
            description="No delivery attempts recorded for this endpoint yet."
          />
        ) : (
          <div className="space-y-3">
            <Table dense columns={attemptColumns} rows={attempts} rowKey={(a) => a.id} />
            <div className="flex items-center justify-between text-xs text-muted">
              <span>
                Showing {attempts.length} of {attemptsTotal}
              </span>
              {attempts.length < attemptsTotal && selectedEndpoint && (
                <Button
                  variant="secondary"
                  size="sm"
                  disabled={loadingAttempts}
                  onClick={() => void loadAttempts(selectedEndpoint, attemptsPage + 1)}
                >
                  {loadingAttempts ? 'Loading…' : 'Load more'}
                </Button>
              )}
            </div>
          </div>
        )}
      </Drawer>
    </div>
  );
}
