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
import { api } from '@/lib/api/client';
import { errorMessage } from '@/lib/api/errors';
import type { ParcelSize } from '@swiftdrop/contracts';

export interface PricingRuleItem {
  id: string;
  name: string;
  fromZoneId: string | null;
  toZoneId: string | null;
  fromZoneName?: string | null;
  toZoneName?: string | null;
  size: ParcelSize | null;
  baseFeeCents: number;
  perKgCents: number;
  priority: number;
  isActive: boolean;
  validFrom?: string | null;
  validTo?: string | null;
  createdAt?: string;
  updatedAt?: string;
}

interface ZoneOption {
  id: string;
  name: string;
  code: string;
}

export function PricingRulesManagement() {
  const [rules, setRules] = useState<PricingRuleItem[]>([]);
  const [zones, setZones] = useState<ZoneOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string>();
  const [modalOpen, setModalOpen] = useState(false);
  const [editingRule, setEditingRule] = useState<PricingRuleItem | null>(null);

  // Form states
  const [name, setName] = useState('');
  const [fromZoneId, setFromZoneId] = useState<string>('');
  const [toZoneId, setToZoneId] = useState<string>('');
  const [size, setSize] = useState<string>('');
  const [baseFeeRupees, setBaseFeeRupees] = useState<string>('450.00');
  const [perKgRupees, setPerKgRupees] = useState<string>('50.00');
  const [priority, setPriority] = useState<number>(0);
  const [isActive, setIsActive] = useState<boolean>(true);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string>();

  async function loadData() {
    setLoading(true);
    setError(undefined);

    const [rulesRes, zonesRes] = await Promise.all([
      api.GET('/api/v1/admin/pricing-rules'),
      api.GET('/api/v1/admin/zones'),
    ]);

    setLoading(false);

    if (rulesRes.error || !rulesRes.data) {
      setError(errorMessage(rulesRes.error, 'Failed to load pricing rules'));
      return;
    }

    setRules(rulesRes.data);
    if (zonesRes.data) {
      setZones(zonesRes.data);
    }
  }

  useEffect(() => {
    void loadData();
  }, []);

  function openCreateModal() {
    setEditingRule(null);
    setName('');
    setFromZoneId('');
    setToZoneId('');
    setSize('');
    setBaseFeeRupees('450.00');
    setPerKgRupees('50.00');
    setPriority(0);
    setIsActive(true);
    setFormError(undefined);
    setModalOpen(true);
  }

  function openEditModal(rule: PricingRuleItem) {
    setEditingRule(rule);
    setName(rule.name);
    setFromZoneId(rule.fromZoneId ?? '');
    setToZoneId(rule.toZoneId ?? '');
    setSize(rule.size ?? '');
    setBaseFeeRupees((rule.baseFeeCents / 100).toFixed(2));
    setPerKgRupees((rule.perKgCents / 100).toFixed(2));
    setPriority(rule.priority);
    setIsActive(rule.isActive);
    setFormError(undefined);
    setModalOpen(true);
  }

  async function handleSaveRule(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setFormError(undefined);

    const baseFeeCents = Math.round(parseFloat(baseFeeRupees || '0') * 100);
    const perKgCents = Math.round(parseFloat(perKgRupees || '0') * 100);

    if (isNaN(baseFeeCents) || baseFeeCents < 0) {
      setSaving(false);
      setFormError('Please enter a valid base fee');
      return;
    }
    if (isNaN(perKgCents) || perKgCents < 0) {
      setSaving(false);
      setFormError('Please enter a valid per-kg rate');
      return;
    }

    const payload = {
      name: name.trim(),
      fromZoneId: fromZoneId || undefined,
      toZoneId: toZoneId || undefined,
      size: (size || undefined) as ParcelSize | undefined,
      baseFeeCents,
      perKgCents,
      priority,
      isActive,
    };

    if (editingRule) {
      const { data, error: apiErr } = await api.PATCH('/api/v1/admin/pricing-rules/{id}', {
        params: { path: { id: editingRule.id } },
        body: payload,
      });

      setSaving(false);

      if (apiErr || !data) {
        setFormError(errorMessage(apiErr, 'Failed to update rule'));
        return;
      }
    } else {
      const { data, error: apiErr } = await api.POST('/api/v1/admin/pricing-rules', {
        body: payload,
      });

      setSaving(false);

      if (apiErr || !data) {
        setFormError(errorMessage(apiErr, 'Failed to create rule'));
        return;
      }
    }

    setModalOpen(false);
    void loadData();
  }

  async function toggleActive(rule: PricingRuleItem) {
    const { error: apiErr } = await api.PATCH('/api/v1/admin/pricing-rules/{id}', {
      params: { path: { id: rule.id } },
      body: { isActive: !rule.isActive },
    });

    if (apiErr) {
      setError(errorMessage(apiErr, 'Failed to update rule status'));
      return;
    }

    void loadData();
  }

  const columns: Column<PricingRuleItem>[] = [
    {
      header: 'Rule Name',
      cell: (r) => (
        <div>
          <span className="font-semibold text-ink block">{r.name}</span>
          <span className="text-xs text-muted">Priority: {r.priority}</span>
        </div>
      ),
    },
    {
      header: 'Origin → Destination',
      cell: (r) => {
        const from = zones.find((z) => z.id === r.fromZoneId)?.name ?? r.fromZoneName;
        const to = zones.find((z) => z.id === r.toZoneId)?.name ?? r.toZoneName;
        if (!r.fromZoneId && !r.toZoneId) {
          return <span className="text-muted text-xs italic">Any (Island-wide)</span>;
        }
        return (
          <span className="text-sm font-medium">
            {from ?? 'Any'} <span className="text-muted">→</span> {to ?? 'Any'}
          </span>
        );
      },
    },
    {
      header: 'Parcel Size',
      cell: (r) => (
        <span className="text-xs">
          {r.size ? (
            <span className="inline-flex rounded-md bg-canvas px-2 py-0.5 border border-line font-medium">
              {r.size}
            </span>
          ) : (
            <span className="text-muted italic">Any Size</span>
          )}
        </span>
      ),
    },
    {
      header: 'Base Fee',
      cell: (r) => (
        <span className="font-medium text-ink">LKR {(r.baseFeeCents / 100).toFixed(2)}</span>
      ),
    },
    {
      header: 'Per Kg Rate',
      cell: (r) => (
        <span className="text-muted text-sm">LKR {(r.perKgCents / 100).toFixed(2)} / kg</span>
      ),
    },
    {
      header: 'Status',
      cell: (r) => (
        <span
          className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium ${
            r.isActive ? 'bg-green-100 text-green-800' : 'bg-slate-100 text-slate-700'
          }`}
        >
          {r.isActive ? 'Active' : 'Inactive'}
        </span>
      ),
    },
    {
      header: 'Actions',
      cell: (r) => (
        <div className="flex items-center gap-2">
          <Button
            variant="secondary"
            className="text-xs py-1 px-2.5"
            onClick={() => openEditModal(r)}
          >
            Edit
          </Button>
          <Button
            variant="ghost"
            className={`text-xs py-1 px-2.5 ${r.isActive ? 'text-amber-700 hover:bg-amber-50' : 'text-green-700 hover:bg-green-50'}`}
            onClick={() => toggleActive(r)}
          >
            {r.isActive ? 'Deactivate' : 'Activate'}
          </Button>
        </div>
      ),
    },
  ];

  return (
    <div className="space-y-4">
      {error && <Alert tone="error">{error}</Alert>}

      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 bg-surface p-4 rounded-lg border border-line">
        <div>
          <h3 className="font-semibold text-ink text-base">Configured Pricing Rules</h3>
          <p className="text-xs text-muted">
            The fee calculation selects the most specific active rule matching the trip zones and
            parcel size.
          </p>
        </div>
        <Button onClick={openCreateModal}>+ Add Pricing Rule</Button>
      </div>

      <Table
        columns={columns}
        rows={rules}
        rowKey={(r) => r.id}
        empty={
          <EmptyState
            title="No pricing rules found"
            description="No delivery pricing rules configured. At least one island-wide rule is recommended."
            action={<Button onClick={openCreateModal}>Create Default Rule</Button>}
          />
        }
      />

      {modalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-xs">
          <div className="w-full max-w-lg rounded-xl border border-line bg-surface p-6 shadow-xl animate-in fade-in zoom-in-95">
            <div className="flex items-start justify-between border-b border-line pb-4">
              <div>
                <h3 className="text-lg font-semibold text-ink">
                  {editingRule ? 'Edit Pricing Rule' : 'Create Pricing Rule'}
                </h3>
                <p className="text-sm text-muted">
                  Configure route matching, base fee, and per-kg rate.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setModalOpen(false)}
                className="text-muted hover:text-ink text-xl font-bold"
              >
                &times;
              </button>
            </div>

            {formError && (
              <div className="mt-4">
                <Alert tone="error">{formError}</Alert>
              </div>
            )}

            <form onSubmit={handleSaveRule} className="mt-4 space-y-4">
              <FormField label="Rule Name" htmlFor="rule-name">
                <Input
                  id="rule-name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="e.g. Within Colombo Express"
                  required
                  disabled={saving}
                />
              </FormField>

              <div className="grid grid-cols-2 gap-3">
                <FormField label="Origin Zone" htmlFor="from-zone">
                  <Select
                    id="from-zone"
                    value={fromZoneId}
                    onChange={(e) => setFromZoneId(e.target.value)}
                    disabled={saving}
                  >
                    <option value="">Any (Wildcard)</option>
                    {zones.map((z) => (
                      <option key={z.id} value={z.id}>
                        {z.name} ({z.code})
                      </option>
                    ))}
                  </Select>
                </FormField>

                <FormField label="Destination Zone" htmlFor="to-zone">
                  <Select
                    id="to-zone"
                    value={toZoneId}
                    onChange={(e) => setToZoneId(e.target.value)}
                    disabled={saving}
                  >
                    <option value="">Any (Wildcard)</option>
                    {zones.map((z) => (
                      <option key={z.id} value={z.id}>
                        {z.name} ({z.code})
                      </option>
                    ))}
                  </Select>
                </FormField>
              </div>

              <div className="grid grid-cols-3 gap-3">
                <FormField label="Parcel Size" htmlFor="parcel-size">
                  <Select
                    id="parcel-size"
                    value={size}
                    onChange={(e) => setSize(e.target.value)}
                    disabled={saving}
                  >
                    <option value="">Any Size</option>
                    <option value="SMALL">SMALL</option>
                    <option value="MEDIUM">MEDIUM</option>
                    <option value="LARGE">LARGE</option>
                  </Select>
                </FormField>

                <FormField label="Base Fee (LKR)" htmlFor="base-fee">
                  <Input
                    id="base-fee"
                    type="number"
                    step="0.01"
                    min="0"
                    value={baseFeeRupees}
                    onChange={(e) => setBaseFeeRupees(e.target.value)}
                    required
                    disabled={saving}
                  />
                </FormField>

                <FormField label="Per Kg (LKR)" htmlFor="per-kg">
                  <Input
                    id="per-kg"
                    type="number"
                    step="0.01"
                    min="0"
                    value={perKgRupees}
                    onChange={(e) => setPerKgRupees(e.target.value)}
                    required
                    disabled={saving}
                  />
                </FormField>
              </div>

              <div className="grid grid-cols-2 gap-3 items-center">
                <FormField
                  label="Priority Score"
                  htmlFor="priority"
                  help="Used for tie-breaking when rules have equal specificity"
                >
                  <Input
                    id="priority"
                    type="number"
                    value={priority}
                    onChange={(e) => setPriority(parseInt(e.target.value, 10) || 0)}
                    disabled={saving}
                  />
                </FormField>

                <div className="flex items-center gap-2 pt-4">
                  <input
                    type="checkbox"
                    id="rule-active"
                    checked={isActive}
                    onChange={(e) => setIsActive(e.target.checked)}
                    className="rounded border-line"
                  />
                  <label htmlFor="rule-active" className="text-sm font-medium text-ink">
                    Active Rule
                  </label>
                </div>
              </div>

              <div className="mt-6 flex justify-end gap-3 pt-3 border-t border-line">
                <Button
                  type="button"
                  variant="secondary"
                  onClick={() => setModalOpen(false)}
                  disabled={saving}
                >
                  Cancel
                </Button>
                <Button type="submit" disabled={saving}>
                  {saving ? 'Saving...' : editingRule ? 'Update Rule' : 'Create Rule'}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
