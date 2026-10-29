'use client';

import { useEffect, useState } from 'react';
import { Alert, Button, EmptyState, FormField, Input, Table, type Column } from '@/components/ui';
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

  async function loadZones() {
    setLoading(true);
    setError(undefined);

    const { data, error: apiErr } = await api.GET('/api/v1/admin/zones');
    setLoading(false);

    if (apiErr || !data) {
      setError(errorMessage(apiErr, 'Failed to load delivery zones'));
      return;
    }

    setZones(data);
  }

  useEffect(() => {
    void loadZones();
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
      cell: (z) => <span className="font-mono font-bold text-ink">{z.code}</span>,
    },
    {
      header: 'Zone Name',
      cell: (z) => <span className="font-medium text-ink">{z.name}</span>,
    },
    {
      header: 'Serviced Cities',
      cell: (z) => (
        <div className="flex flex-wrap gap-1 max-w-md">
          {z.cities.map((city) => (
            <span
              key={city}
              className="inline-flex rounded-md bg-canvas px-2 py-0.5 text-xs text-ink border border-line capitalize"
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
        <span
          className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium ${
            z.isActive ? 'bg-green-100 text-green-800' : 'bg-slate-100 text-slate-700'
          }`}
        >
          {z.isActive ? 'Active' : 'Inactive'}
        </span>
      ),
    },
    {
      header: 'Actions',
      cell: (z) => (
        <div className="flex items-center gap-2">
          <Button
            variant="secondary"
            className="text-xs py-1 px-2.5"
            onClick={() => openEditModal(z)}
          >
            Edit
          </Button>
          <Button
            variant="ghost"
            className={`text-xs py-1 px-2.5 ${z.isActive ? 'text-amber-700 hover:bg-amber-50' : 'text-green-700 hover:bg-green-50'}`}
            onClick={() => toggleActive(z)}
          >
            {z.isActive ? 'Deactivate' : 'Activate'}
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
          <h3 className="font-semibold text-ink text-base">Configured Delivery Zones</h3>
          <p className="text-xs text-muted">
            Zones determine which areas are serviceable and drive fee estimation rules.
          </p>
        </div>
        <Button onClick={openCreateModal}>+ Add Delivery Zone</Button>
      </div>

      <Table
        columns={columns}
        rows={zones}
        rowKey={(z) => z.id}
        empty={
          <EmptyState
            title="No delivery zones"
            description="No delivery zones have been configured yet."
            action={<Button onClick={openCreateModal}>Create First Zone</Button>}
          />
        }
      />

      {modalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-xs">
          <div className="w-full max-w-md rounded-xl border border-line bg-surface p-6 shadow-xl animate-in fade-in zoom-in-95">
            <div className="flex items-start justify-between border-b border-line pb-4">
              <div>
                <h3 className="text-lg font-semibold text-ink">
                  {editingZone ? 'Edit Delivery Zone' : 'Create Delivery Zone'}
                </h3>
                <p className="text-sm text-muted">Configure zone identifier and covered cities.</p>
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

            <form onSubmit={handleSaveZone} className="mt-4 space-y-4">
              <FormField label="Zone Code (e.g. CMB, KDY)" htmlFor="zone-code">
                <Input
                  id="zone-code"
                  value={code}
                  onChange={(e) => setCode(e.target.value.toUpperCase())}
                  placeholder="CMB"
                  required
                  disabled={saving}
                />
              </FormField>

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

              <div className="flex items-center gap-2 pt-1">
                <input
                  type="checkbox"
                  id="zone-active"
                  checked={isActive}
                  onChange={(e) => setIsActive(e.target.checked)}
                  className="rounded border-line"
                />
                <label htmlFor="zone-active" className="text-sm font-medium text-ink">
                  Active (available for bookings and fee calculation)
                </label>
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
                  {saving ? 'Saving...' : editingZone ? 'Update Zone' : 'Create Zone'}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
