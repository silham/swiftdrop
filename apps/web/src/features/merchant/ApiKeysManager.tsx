'use client';

import { useEffect, useState } from 'react';
import { Alert, Button, Card, EmptyState, FormField, Input, Table, type Column } from '@/components/ui';
import { errorMessage } from '@/lib/api/errors';

interface ApiKeyItem {
  id: string;
  name: string;
  prefix: string;
  lastUsedAt?: string | null;
  revokedAt?: string | null;
  createdAt: string;
}

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
  const [copied, setCopied] = useState(false);

  async function loadKeys() {
    try {
      setLoading(true);
      const res = await fetch('/api/v1/merchants/me/api-keys');
      if (!res.ok) throw await res.json();
      const data = await res.json();
      setKeys(data);
    } catch (err) {
      setError(errorMessage(err, 'Failed to load API keys'));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadKeys();
  }, []);

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
      const created = await res.json();

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
    if (!confirm('Are you sure you want to revoke this API key? This action is permanent and immediate.')) {
      return;
    }

    try {
      const res = await fetch(`/api/v1/merchants/me/api-keys/${id}`, {
        method: 'DELETE',
      });
      if (!res.ok) throw await res.json();
      await loadKeys();
    } catch (err) {
      setError(errorMessage(err, 'Failed to revoke API key'));
    }
  }

  function copyToClipboard(text: string) {
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2500);
  }

  const columns: Column<ApiKeyItem>[] = [
    {
      header: 'Name',
      cell: (row) => <span className="font-medium">{row.name}</span>,
    },
    {
      header: 'Key Prefix',
      cell: (row) => (
        <code className="rounded bg-canvas px-2 py-0.5 font-mono text-xs text-muted">
          {row.prefix}...
        </code>
      ),
    },
    {
      header: 'Last Used',
      cell: (row) => (
        <span className="text-xs text-muted">
          {row.lastUsedAt ? new Date(row.lastUsedAt).toLocaleString() : 'Never'}
        </span>
      ),
    },
    {
      header: 'Status',
      cell: (row) =>
        row.revokedAt ? (
          <span className="inline-flex rounded-full bg-red-100 px-2 py-0.5 text-xs font-medium text-red-700">
            Revoked
          </span>
        ) : (
          <span className="inline-flex rounded-full bg-green-100 px-2 py-0.5 text-xs font-medium text-green-700">
            Active
          </span>
        ),
    },
    {
      header: 'Created',
      cell: (row) => (
        <span className="text-xs text-muted">
          {new Date(row.createdAt).toLocaleDateString()}
        </span>
      ),
    },
    {
      header: 'Actions',
      cell: (row) =>
        !row.revokedAt ? (
          <Button
            variant="danger"
            className="px-2 py-1 text-xs"
            onClick={() => handleRevoke(row.id)}
          >
            Revoke
          </Button>
        ) : (
          <span className="text-xs text-muted">—</span>
        ),
    },
  ];

  return (
    <div className="space-y-6">
      {error && <Alert tone="error">{error}</Alert>}

      {/* One-time Newly Created Raw Key Modal/Banner */}
      {createdRawKey && (
        <div className="rounded-lg border-2 border-brand bg-brand-soft/20 p-5 space-y-3">
          <div className="flex items-start justify-between">
            <div>
              <h3 className="font-semibold text-brand-dark text-base">New API Key Generated</h3>
              <p className="text-xs text-muted mt-0.5">
                Please copy this key immediately and store it in a secure location. For your security,
                it will <strong>never be shown again</strong>.
              </p>
            </div>
            <button
              onClick={() => setCreatedRawKey(null)}
              className="text-xs text-muted hover:text-ink font-medium"
            >
              Dismiss ✕
            </button>
          </div>

          <div className="flex items-center gap-2">
            <input
              type="text"
              readOnly
              value={createdRawKey}
              className="w-full rounded border border-line bg-surface px-3 py-2 font-mono text-sm select-all outline-none"
            />
            <Button
              variant="primary"
              onClick={() => copyToClipboard(createdRawKey)}
              className="whitespace-nowrap"
            >
              {copied ? '✓ Copied!' : 'Copy Key'}
            </Button>
          </div>
        </div>
      )}

      {/* Action Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-base font-semibold">Active & Revoked API Keys</h2>
          <p className="text-xs text-muted">
            Used to authenticate with the partner API (<code className="font-mono">X-Api-Key</code> header).
          </p>
        </div>
        {!isCreating && (
          <Button variant="primary" onClick={() => setIsCreating(true)}>
            + Generate Key
          </Button>
        )}
      </div>

      {/* Create Key Form Modal/Card */}
      {isCreating && (
        <Card className="p-4 space-y-3 border-brand">
          <h3 className="text-sm font-semibold">Generate a New Partner API Key</h3>
          <form onSubmit={handleCreateKey} className="flex items-end gap-3">
            <div className="flex-1">
              <FormField label="Key Name / Description" htmlFor="keyName">
                <Input
                  id="keyName"
                  placeholder="e.g. Production Shopify Store, Warehouse Webhook"
                  value={keyName}
                  onChange={(e) => setKeyName(e.target.value)}
                  required
                />
              </FormField>
            </div>
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
          </form>
        </Card>
      )}

      {/* Keys Table */}
      <Table
        columns={columns}
        rows={keys}
        rowKey={(k) => k.id}
        empty={
          <EmptyState
            title="No API Keys"
            description="You haven't generated any partner API keys yet."
            action={
              <Button variant="primary" onClick={() => setIsCreating(true)}>
                Generate Your First Key
              </Button>
            }
          />
        }
      />
    </div>
  );
}

