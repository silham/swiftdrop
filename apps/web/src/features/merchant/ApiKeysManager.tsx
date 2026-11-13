'use client';

import { KeyRound, Plus } from 'lucide-react';
import { useEffect, useState } from 'react';
import {
  Alert,
  Badge,
  Button,
  Card,
  CardBody,
  CardHeader,
  EmptyState,
  FormField,
  Input,
  Skeleton,
  Table,
  type Column,
} from '@/components/ui';
import { errorMessage } from '@/lib/api/errors';
import { formatDate, formatDateTime } from '@/lib/format';
import { SecretReveal } from './SecretReveal';

interface ApiKeyItem {
  id: string;
  name: string;
  prefix: string;
  lastUsedAt?: string | null;
  revokedAt?: string | null;
  createdAt: string;
}

async function fetchKeys(signal?: AbortSignal): Promise<ApiKeyItem[]> {
  const res = await fetch('/api/v1/merchants/me/api-keys', { signal });
  if (!res.ok) throw await res.json();
  return (await res.json()) as ApiKeyItem[];
}

/** Owner: M5. Create, list and revoke partner API keys; the raw key is shown once. */
export function ApiKeysManager() {
  const [keys, setKeys] = useState<ApiKeyItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Creation form state
  const [isCreating, setIsCreating] = useState(false);
  const [keyName, setKeyName] = useState('');
  const [submitting, setSubmitting] = useState(false);

  // One-time newly created key display
  const [createdRawKey, setCreatedRawKey] = useState<string | null>(null);

  useEffect(() => {
    const controller = new AbortController();

    async function loadInitialKeys() {
      try {
        const data = await fetchKeys(controller.signal);
        if (!controller.signal.aborted) setKeys(data);
      } catch (err) {
        if (!controller.signal.aborted) {
          setError(errorMessage(err, 'Failed to load API keys'));
        }
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    }

    void loadInitialKeys();
    return () => controller.abort();
  }, []);

  async function loadKeys() {
    try {
      setLoading(true);
      const data = await fetchKeys();
      setKeys(data);
    } catch (err) {
      setError(errorMessage(err, 'Failed to load API keys'));
    } finally {
      setLoading(false);
    }
  }

  async function handleCreateKey(e: React.FormEvent) {
    e.preventDefault();
    if (!keyName.trim()) return;

    try {
      setSubmitting(true);
      setError(null);
      const res = await fetch('/api/v1/merchants/me/api-keys', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: keyName.trim() }),
      });

      if (!res.ok) throw await res.json();
      const created = (await res.json()) as { key: string };

      setCreatedRawKey(created.key);
      setKeyName('');
      setIsCreating(false);
      await loadKeys();
    } catch (err) {
      setError(errorMessage(err, 'Failed to create API key'));
    } finally {
      setSubmitting(false);
    }
  }

  async function handleRevoke(id: string) {
    if (
      !confirm(
        'Are you sure you want to revoke this API key? This action is permanent and immediate.',
      )
    ) {
      return;
    }

    try {
      setError(null);
      const res = await fetch(`/api/v1/merchants/me/api-keys/${id}`, {
        method: 'DELETE',
      });
      if (!res.ok) throw await res.json();
      await loadKeys();
    } catch (err) {
      setError(errorMessage(err, 'Failed to revoke API key'));
    }
  }

  const columns: Column<ApiKeyItem>[] = [
    {
      header: 'Name',
      cell: (row) => <span className="font-medium text-ink">{row.name}</span>,
    },
    {
      header: 'Key Prefix',
      cell: (row) => (
        <code className="rounded-md border border-line bg-surface-2 px-2 py-0.5 font-mono text-xs text-muted">
          {row.prefix}...
        </code>
      ),
    },
    {
      header: 'Last Used',
      cell: (row) => (
        <span className="text-xs text-muted">
          {row.lastUsedAt ? formatDateTime(row.lastUsedAt) : 'Never'}
        </span>
      ),
    },
    {
      header: 'Status',
      cell: (row) =>
        row.revokedAt ? (
          <Badge tone="danger" dot>
            Revoked
          </Badge>
        ) : (
          <Badge tone="success" dot>
            Active
          </Badge>
        ),
    },
    {
      header: 'Created',
      cell: (row) => <span className="text-xs text-muted">{formatDate(row.createdAt)}</span>,
    },
    {
      header: 'Actions',
      headerClassName: 'text-right',
      className: 'px-4 py-3 text-right',
      cell: (row) =>
        !row.revokedAt ? (
          <Button variant="danger" size="sm" onClick={() => handleRevoke(row.id)}>
            Revoke
          </Button>
        ) : (
          <span className="text-xs text-muted">—</span>
        ),
    },
  ];

  const activeCount = keys.filter((k) => !k.revokedAt).length;

  return (
    <div className="space-y-6">
      {error && <Alert tone="error">{error}</Alert>}

      {/* One-time newly created raw key */}
      {createdRawKey && (
        <SecretReveal
          title="New API Key Generated"
          value={createdRawKey}
          copyLabel="Copy Key"
          onDismiss={() => setCreatedRawKey(null)}
        >
          Please copy this key immediately and store it in a secure location. For your security, it
          will <strong className="text-ink">never be shown again</strong>.
        </SecretReveal>
      )}

      {isCreating && (
        <Card flush className="ring-2 ring-brand/30">
          <CardHeader
            title="Generate a New Partner API Key"
            titleAs="h3"
            icon={<KeyRound />}
            description="Give the key a name so you can recognise where it is used."
          />
          <CardBody>
            <form
              onSubmit={handleCreateKey}
              className="flex flex-col gap-3 sm:flex-row sm:items-end"
            >
              <div className="flex-1">
                <FormField label="Key Name / Description" htmlFor="keyName">
                  <Input
                    id="keyName"
                    placeholder="e.g. Production Shopify Store, Warehouse Webhook"
                    value={keyName}
                    onChange={(e) => setKeyName(e.target.value)}
                    required
                    autoFocus
                  />
                </FormField>
              </div>
              <div className="flex gap-2">
                <Button type="submit" disabled={submitting}>
                  {submitting ? 'Generating...' : 'Confirm'}
                </Button>
                <Button
                  type="button"
                  variant="secondary"
                  onClick={() => {
                    setIsCreating(false);
                    setKeyName('');
                  }}
                >
                  Cancel
                </Button>
              </div>
            </form>
          </CardBody>
        </Card>
      )}

      <Card flush>
        <CardHeader
          title="Active & Revoked API Keys"
          description={
            <>
              {activeCount} active · used to authenticate with the partner API (
              <code className="font-mono">X-Api-Key</code> header).
            </>
          }
          actions={
            !isCreating && (
              <Button variant="primary" size="sm" onClick={() => setIsCreating(true)}>
                <Plus className="h-4 w-4" aria-hidden="true" /> Generate Key
              </Button>
            )
          }
        />
        {loading ? (
          <div className="space-y-3 p-5" role="status" aria-label="Loading API keys...">
            {[1, 2, 3].map((i) => (
              <Skeleton key={i} className="h-10 w-full" />
            ))}
          </div>
        ) : (
          <Table
            bare
            columns={columns}
            rows={keys}
            rowKey={(k) => k.id}
            empty={
              <div className="p-5">
                <EmptyState
                  compact
                  className="border-0"
                  icon={<KeyRound />}
                  title="No API Keys"
                  description="You haven't generated any partner API keys yet."
                  action={
                    <Button variant="primary" onClick={() => setIsCreating(true)}>
                      Generate Your First Key
                    </Button>
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
