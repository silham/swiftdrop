'use client';

import { ArrowRight, Plus, Tag } from 'lucide-react';
import { useEffect, useState } from 'react';
import {
  Alert,
  Badge,
  Button,
  Card,
  CardHeader,
  EmptyState,
  FormField,
  Input,
  Modal,
  Select,
  Skeleton,
  Table,
  type Column,
} from '@/components/ui';
import { formatMoney } from '@/lib/format';
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

  /** For buttons and after edits: show the spinner, then reload. */
  async function loadData() {
    setLoading(true);
    setError(undefined);
    await fetchData();
  }

  /** Fetches and stores the data. Only sets state after the request, so effects can call it. */
  async function fetchData() {
    const [rulesRes, zonesRes] = await Promise.all([
      api.GET('/api/v1/admin/pricing-rules'),
      api.GET('/api/v1/admin/zones'),
    ]);

    setLoading(false);

    const { data: ruleData, error: ruleError } = rulesRes;
    if (!ruleData) {
      setError(errorMessage(ruleError, 'Failed to load pricing rules'));
      return;
    }

    setRules(ruleData);
    if (zonesRes.data) {
      setZones(zonesRes.data);
    }
  }

  useEffect(() => {
    void fetchData();
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
      header: 'Rule',
      cell: (r) => (
        <div className="min-w-40">
          <span className="block font-medium text-ink">{r.name}</span>
          <span className="mt-1 flex items-center gap-2 text-xs text-muted">
            <Badge tone={r.isActive ? 'success' : 'neutral'} dot>
              {r.isActive ? 'Active' : 'Inactive'}
            </Badge>
            Priority {r.priority}
          </span>
        </div>
      ),
    },
    {
      header: 'Route & size',
      cell: (r) => {
        const from = zones.find((z) => z.id === r.fromZoneId)?.name ?? r.fromZoneName;
        const to = zones.find((z) => z.id === r.toZoneId)?.name ?? r.toZoneName;
        return (
          <div className="min-w-36 space-y-1">
            {!r.fromZoneId && !r.toZoneId ? (
              <Badge tone="brand">Any (Island-wide)</Badge>
            ) : (
              <span className="inline-flex items-center gap-1.5 text-sm font-medium whitespace-nowrap text-ink">
                {from ?? 'Any'}
                <ArrowRight className="h-3.5 w-3.5 text-subtle" aria-label="to" />
                {to ?? 'Any'}
              </span>
            )}
            <span className="block text-xs text-muted">
              {r.size ? `${r.size} parcels` : 'Any Size'}
            </span>
          </div>
        );
      },
    },
    {
      header: 'Fees',
      headerClassName: 'text-right',
      className: 'px-4 py-3 text-right whitespace-nowrap',
      cell: (r) => (
        <div className="tabular-nums">
          <span className="block font-medium text-ink">{formatMoney(r.baseFeeCents)}</span>
          <span className="text-xs text-muted">+ {formatMoney(r.perKgCents)} / kg</span>
        </div>
      ),
    },
    {
      header: 'Actions',
      headerClassName: 'text-right',
      className: 'px-4 py-3 text-right',
      cell: (r) => (
        <div className="flex items-center justify-end gap-1.5">
          <Button variant="secondary" size="sm" onClick={() => openEditModal(r)}>
            Edit
          </Button>
          <Button
            variant="subtle"
            size="sm"
            className={r.isActive ? 'text-warning' : 'text-success'}
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

      <Card flush>
        <CardHeader
          title="Configured Pricing Rules"
          titleAs="h3"
          description="The fee calculation selects the most specific active rule matching the trip zones and parcel size."
          icon={<Tag />}
          actions={
            <Button size="sm" onClick={openCreateModal}>
              <Plus className="h-4 w-4" aria-hidden="true" />
              Add Pricing Rule
            </Button>
          }
        />
        {loading && rules.length === 0 ? (
          <div className="space-y-3 p-5" role="status" aria-label="Loading pricing rules">
            {[1, 2, 3].map((i) => (
              <Skeleton key={i} className="h-10 w-full" />
            ))}
          </div>
        ) : (
          <Table
            bare
            caption="Pricing rules"
            columns={columns}
            rows={rules}
            rowKey={(r) => r.id}
            empty={
              <div className="p-5">
                <EmptyState
                  compact
                  icon={<Tag />}
                  title="No pricing rules found"
                  description="No delivery pricing rules configured. At least one island-wide rule is recommended."
                  action={<Button onClick={openCreateModal}>Create Default Rule</Button>}
                />
              </div>
            }
          />
        )}
      </Card>

      <Modal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        size="lg"
        title={editingRule ? 'Edit Pricing Rule' : 'Create Pricing Rule'}
        titleAs="h3"
        description="Configure route matching, base fee, and per-kg rate."
        footer={
          <>
            <Button
              type="button"
              variant="secondary"
              onClick={() => setModalOpen(false)}
              disabled={saving}
            >
              Cancel
            </Button>
            <Button type="submit" form="pricing-rule-form" disabled={saving}>
              {saving ? 'Saving...' : editingRule ? 'Update Rule' : 'Create Rule'}
            </Button>
          </>
        }
      >
        <form id="pricing-rule-form" onSubmit={handleSaveRule} className="space-y-4">
          {formError && <Alert tone="error">{formError}</Alert>}

          <FormField label="Rule Name" htmlFor="rule-name">
            <Input
              id="rule-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Within Colombo Express"
              required
              disabled={saving}
              data-autofocus
            />
          </FormField>

          <div className="grid gap-3 sm:grid-cols-2">
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

          <div className="grid gap-3 sm:grid-cols-3">
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

          <div className="grid items-start gap-3 sm:grid-cols-2">
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

            <label
              htmlFor="rule-active"
              className="flex cursor-pointer items-start gap-3 rounded-lg border border-line bg-surface-2 p-3 sm:mt-6"
            >
              <input
                type="checkbox"
                id="rule-active"
                checked={isActive}
                onChange={(e) => setIsActive(e.target.checked)}
                className="mt-0.5 h-4 w-4 accent-brand"
              />
              <span className="text-sm">
                <span className="font-medium text-ink">Active Rule</span>
                <span className="block text-xs text-muted">Used for new fee estimates</span>
              </span>
            </label>
          </div>
        </form>
      </Modal>
    </div>
  );
}
