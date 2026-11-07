'use client';

import { Building, CircleCheck, Map as MapIcon, Plus } from 'lucide-react';
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
  Skeleton,
  StatCard,
  StatGrid,
  Table,
  type Column,
} from '@/components/ui';
import { formatNumber } from '@/lib/format';
import { api } from '@/lib/api/client';
import { errorMessage } from '@/lib/api/errors';

export interface ZoneItem {
  id: string;
  code: string;
  name: string;
  cities: string[];
  isActive: boolean;
  createdAt?: string;
  updatedAt?: string;
}

export function ZonesManagement() {
  const [zones, setZones] = useState<ZoneItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string>();
  const [modalOpen, setModalOpen] = useState(false);
  const [editingZone, setEditingZone] = useState<ZoneItem | null>(null);

  // Form states
  const [code, setCode] = useState('');
  const [name, setName] = useState('');
  const [citiesInput, setCitiesInput] = useState('');
  const [isActive, setIsActive] = useState(true);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string>();

  /** For buttons and after edits: show the spinner, then reload. */
  async function loadZones() {
    setLoading(true);
    setError(undefined);
    await fetchZones();
  }

  /** Fetches and stores the data. Only sets state after the request, so effects can call it. */
  async function fetchZones() {
    const { data, error: apiErr } = await api.GET('/api/v1/admin/zones');
    setLoading(false);

    if (apiErr || !data) {
      setError(errorMessage(apiErr, 'Failed to load delivery zones'));
      return;
    }

    setZones(data);
  }

  useEffect(() => {
    void fetchZones();
  }, []);

  function openCreateModal() {
    setEditingZone(null);
    setCode('');
    setName('');
    setCitiesInput('');
    setIsActive(true);
    setFormError(undefined);
    setModalOpen(true);
  }

  function openEditModal(zone: ZoneItem) {
    setEditingZone(zone);
    setCode(zone.code);
    setName(zone.name);
    setCitiesInput(zone.cities.join(', '));
    setIsActive(zone.isActive);
    setFormError(undefined);
    setModalOpen(true);
  }

  async function handleSaveZone(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setFormError(undefined);

    const cities = citiesInput
      .split(',')
      .map((c) => c.trim().toLowerCase())
      .filter(Boolean);

    if (cities.length === 0) {
      setSaving(false);
      setFormError('Please enter at least one serviced city');
      return;
    }

    if (editingZone) {
      const { data, error: apiErr } = await api.PATCH('/api/v1/admin/zones/{id}', {
        params: { path: { id: editingZone.id } },
        body: {
          code: code.trim().toUpperCase(),
          name: name.trim(),
          cities,
          isActive,
        },
      });

      setSaving(false);

      if (apiErr || !data) {
        setFormError(errorMessage(apiErr, 'Failed to update zone'));
        return;
      }
    } else {
      const { data, error: apiErr } = await api.POST('/api/v1/admin/zones', {
        body: {
          code: code.trim().toUpperCase(),
          name: name.trim(),
          cities,
          isActive,
        },
      });

      setSaving(false);

      if (apiErr || !data) {
        setFormError(errorMessage(apiErr, 'Failed to create zone'));
        return;
      }
    }

    setModalOpen(false);
    void loadZones();
  }

  async function toggleActive(zone: ZoneItem) {
    const { error: apiErr } = await api.PATCH('/api/v1/admin/zones/{id}', {
      params: { path: { id: zone.id } },
      body: { isActive: !zone.isActive },
    });

    if (apiErr) {
      setError(errorMessage(apiErr, 'Failed to update zone status'));
      return;
    }

    void loadZones();
  }

  const columns: Column<ZoneItem>[] = [
    {
      header: 'Code',
      cell: (z) => (
        <span className="inline-flex rounded-md bg-brand-soft px-2 py-0.5 font-mono text-xs font-semibold text-brand-dark">
          {z.code}
        </span>
      ),
    },
    {
      header: 'Zone Name',
      cell: (z) => <span className="font-medium text-ink">{z.name}</span>,
    },
    {
      header: 'Serviced Cities',
      cell: (z) => (
        <div className="flex max-w-md flex-wrap gap-1">
          {z.cities.map((city) => (
            <span
              key={city}
              className="inline-flex rounded-md border border-line bg-surface-2 px-2 py-0.5 text-xs text-ink capitalize"
            >
              {city}
            </span>
          ))}
        </div>
      ),
    },
    {
      header: 'Status',
      cell: (z) => (
        <Badge tone={z.isActive ? 'success' : 'neutral'} dot>
          {z.isActive ? 'Active' : 'Inactive'}
        </Badge>
      ),
    },
    {
      header: 'Actions',
      headerClassName: 'text-right',
      className: 'px-4 py-3 text-right',
      cell: (z) => (
        <div className="flex items-center justify-end gap-2">
          <Button variant="secondary" size="sm" onClick={() => openEditModal(z)}>
            Edit
          </Button>
          <Button
            variant="subtle"
            size="sm"
            className={z.isActive ? 'text-warning' : 'text-success'}
            onClick={() => toggleActive(z)}
          >
            {z.isActive ? 'Deactivate' : 'Activate'}
          </Button>
        </div>
      ),
    },
  ];

  const activeZones = zones.filter((z) => z.isActive).length;
  const cityCount = new Set(zones.filter((z) => z.isActive).flatMap((z) => z.cities)).size;

  return (
    <div className="space-y-6">
      <StatGrid cols={3}>
        <StatCard
          label="Delivery zones"
          value={formatNumber(zones.length)}
          icon={<MapIcon />}
          loading={loading && zones.length === 0}
          hint="Configured service areas"
        />
        <StatCard
          label="Active zones"
          value={formatNumber(activeZones)}
          icon={<CircleCheck />}
          tone="success"
          loading={loading && zones.length === 0}
          hint={zones.length ? `${zones.length - activeZones} inactive` : undefined}
        />
        <StatCard
          label="Cities serviced"
          value={formatNumber(cityCount)}
          icon={<Building />}
          tone="info"
          loading={loading && zones.length === 0}
          hint="Across active zones"
        />
      </StatGrid>

      {error && <Alert tone="error">{error}</Alert>}

      <Card flush>
        <CardHeader
          title="Configured Delivery Zones"
          titleAs="h3"
          description="Zones determine which areas are serviceable and drive fee estimation rules."
          icon={<MapIcon />}
          actions={
            <Button size="sm" onClick={openCreateModal}>
              <Plus className="h-4 w-4" aria-hidden="true" />
              Add Delivery Zone
            </Button>
          }
        />
        {loading && zones.length === 0 ? (
          <div className="space-y-3 p-5" role="status" aria-label="Loading delivery zones">
            {[1, 2, 3].map((i) => (
              <Skeleton key={i} className="h-10 w-full" />
            ))}
          </div>
        ) : (
          <Table
            bare
            caption="Delivery zones"
            columns={columns}
            rows={zones}
            rowKey={(z) => z.id}
            empty={
              <div className="p-5">
                <EmptyState
                  compact
                  icon={<MapIcon />}
                  title="No delivery zones"
                  description="No delivery zones have been configured yet."
                  action={<Button onClick={openCreateModal}>Create First Zone</Button>}
                />
              </div>
            }
          />
        )}
      </Card>

      <Modal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        title={editingZone ? 'Edit Delivery Zone' : 'Create Delivery Zone'}
        titleAs="h3"
        description="Configure zone identifier and covered cities."
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
            <Button type="submit" form="zone-form" disabled={saving}>
              {saving ? 'Saving...' : editingZone ? 'Update Zone' : 'Create Zone'}
            </Button>
          </>
        }
      >
        <form id="zone-form" onSubmit={handleSaveZone} className="space-y-4">
          {formError && <Alert tone="error">{formError}</Alert>}

          <div className="grid gap-4 sm:grid-cols-3">
            <FormField label="Zone Code (e.g. CMB, KDY)" htmlFor="zone-code">
              <Input
                id="zone-code"
                value={code}
                onChange={(e) => setCode(e.target.value.toUpperCase())}
                placeholder="CMB"
                required
                disabled={saving}
                data-autofocus
              />
            </FormField>

            <div className="sm:col-span-2">
              <FormField label="Zone Name" htmlFor="zone-name">
                <Input
                  id="zone-name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Colombo District"
                  required
                  disabled={saving}
                />
              </FormField>
            </div>
          </div>

          <FormField
            label="Serviced Cities"
            htmlFor="zone-cities"
            help="Comma-separated city names (e.g. colombo, dehiwala, kotte)"
          >
            <Input
              id="zone-cities"
              value={citiesInput}
              onChange={(e) => setCitiesInput(e.target.value)}
              placeholder="colombo, dehiwala, mount lavinia"
              required
              disabled={saving}
            />
          </FormField>

          <label
            htmlFor="zone-active"
            className="flex cursor-pointer items-start gap-3 rounded-lg border border-line bg-surface-2 p-3"
          >
            <input
              type="checkbox"
              id="zone-active"
              checked={isActive}
              onChange={(e) => setIsActive(e.target.checked)}
              className="mt-0.5 h-4 w-4 accent-brand"
            />
            <span className="text-sm">
              <span className="font-medium text-ink">Active</span>
              <span className="block text-xs text-muted">
                Available for bookings and fee calculation
              </span>
            </span>
          </label>
        </form>
      </Modal>
    </div>
  );
}
