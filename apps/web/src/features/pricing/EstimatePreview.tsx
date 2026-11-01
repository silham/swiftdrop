'use client';

import { useState } from 'react';
import { Alert, Button, Card, FormField, Input, Select } from '@/components/ui';
import { api } from '@/lib/api/client';
import { errorMessage } from '@/lib/api/errors';
import type { ParcelSize } from '@swiftdrop/contracts';

export interface EstimateResult {
  feeCents: number;
  currency: string;
  pickupZoneId: string;
  dropoffZoneId: string;
  ruleId: string;
  ruleName: string;
}

export function EstimatePreview() {
  const [pickupCity, setPickupCity] = useState('colombo');
  const [dropoffCity, setDropoffCity] = useState('kandy');
  const [size, setSize] = useState<ParcelSize>('SMALL');
  const [weightKg, setWeightKg] = useState('1.5');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string>();
  const [result, setResult] = useState<EstimateResult | null>(null);

  async function handleEstimate(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(undefined);
    setResult(null);

    const parsedWeight = parseFloat(weightKg);
    if (isNaN(parsedWeight) || parsedWeight <= 0) {
      setLoading(false);
      setError('Please enter a valid parcel weight');
      return;
    }

    const { data, error: apiErr } = await api.POST('/api/v1/pricing/estimate', {
      body: {
        pickupCity: pickupCity.trim(),
        dropoffCity: dropoffCity.trim(),
        size,
        weightKg: parsedWeight,
      },
    });

    setLoading(false);

    if (apiErr || !data) {
      setError(errorMessage(apiErr, 'Fee calculation failed'));
      return;
    }

    setResult(data);
  }

  return (
    <Card className="p-6 bg-surface border border-line">
      <div className="border-b border-line pb-3 mb-4">
        <h3 className="font-semibold text-ink text-base">Live Fee Estimator Preview</h3>
        <p className="text-xs text-muted">
          Test and preview how your configured zones and pricing rules calculate fees for any
          booking trip.
        </p>
      </div>

      {error && (
        <div className="mb-4">
          <Alert tone="error">{error}</Alert>
        </div>
      )}

      <form onSubmit={handleEstimate} className="grid grid-cols-1 sm:grid-cols-4 gap-3 items-end">
        <FormField label="Pickup City" htmlFor="preview-pickup">
          <Input
            id="preview-pickup"
            value={pickupCity}
            onChange={(e) => setPickupCity(e.target.value)}
            placeholder="e.g. colombo"
            required
            disabled={loading}
          />
        </FormField>

        <FormField label="Dropoff City" htmlFor="preview-dropoff">
          <Input
            id="preview-dropoff"
            value={dropoffCity}
            onChange={(e) => setDropoffCity(e.target.value)}
            placeholder="e.g. kandy"
            required
            disabled={loading}
          />
        </FormField>

        <FormField label="Parcel Size" htmlFor="preview-size">
          <Select
            id="preview-size"
            value={size}
            onChange={(e) => setSize(e.target.value as ParcelSize)}
            disabled={loading}
          >
            <option value="SMALL">SMALL</option>
            <option value="MEDIUM">MEDIUM</option>
            <option value="LARGE">LARGE</option>
          </Select>
        </FormField>

        <FormField label="Weight (kg)" htmlFor="preview-weight">
          <Input
            id="preview-weight"
            type="number"
            step="0.1"
            min="0.1"
            max="100"
            value={weightKg}
            onChange={(e) => setWeightKg(e.target.value)}
            required
            disabled={loading}
          />
        </FormField>

        <div className="sm:col-span-4 flex justify-end pt-2">
          <Button type="submit" disabled={loading}>
            {loading ? 'Estimating...' : 'Calculate Fee'}
          </Button>
        </div>
      </form>

      {result && (
        <div className="mt-5 rounded-lg border border-green-200 bg-green-50/50 p-4 animate-in fade-in">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <span className="text-xs font-semibold text-green-800 uppercase tracking-wide">
                Estimated Delivery Fee
              </span>
              <p className="text-2xl font-bold text-ink mt-0.5">
                {result.currency} {(result.feeCents / 100).toFixed(2)}
              </p>
            </div>
            <div className="text-xs text-muted space-y-1 sm:text-right">
              <div>
                <span className="font-medium text-ink">Applied Rule:</span> {result.ruleName}
              </div>
              <div>
                <span className="font-medium text-ink">Weight Billing:</span> {weightKg} kg (billed
                as {Math.ceil(parseFloat(weightKg))} kg)
              </div>
              <div>
                <span className="font-medium text-ink">Trip:</span>{' '}
                <span className="capitalize">{pickupCity}</span> →{' '}
                <span className="capitalize">{dropoffCity}</span>
              </div>
            </div>
          </div>
        </div>
      )}
    </Card>
  );
}
