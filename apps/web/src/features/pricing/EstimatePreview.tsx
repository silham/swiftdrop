'use client';

import { Calculator, MapPin } from 'lucide-react';
import { useState } from 'react';
import {
  Alert,
  Badge,
  Button,
  Card,
  CardBody,
  CardHeader,
  FormField,
  Input,
  Select,
} from '@/components/ui';
import { formatMoney } from '@/lib/format';
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
    <Card flush className="lg:sticky lg:top-24">
      <CardHeader
        title="Live Fee Estimator Preview"
        titleAs="h3"
        icon={<Calculator />}
        description="Test how your configured zones and pricing rules calculate fees for any booking trip."
      />
      <CardBody className="space-y-4">
        {error && <Alert tone="error">{error}</Alert>}

        <form
          onSubmit={handleEstimate}
          className="grid gap-3 sm:grid-cols-2 lg:grid-cols-1 xl:grid-cols-2"
        >
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

          <Button
            type="submit"
            disabled={loading}
            className="w-full sm:col-span-2 lg:col-span-1 xl:col-span-2"
          >
            {loading ? 'Estimating...' : 'Calculate Fee'}
          </Button>
        </form>

        {result && (
          <div className="animate-fade-in rounded-xl border border-success/25 bg-success-soft p-4">
            <span className="text-xs font-semibold tracking-wide text-success uppercase">
              Estimated Delivery Fee
            </span>
            <p className="mt-0.5 text-3xl font-semibold tracking-tight text-ink tabular-nums">
              {formatMoney(result.feeCents, result.currency)}
            </p>
            <dl className="mt-3 space-y-1.5 border-t border-success/20 pt-3 text-xs">
              <div className="flex items-center justify-between gap-3">
                <dt className="text-muted">Applied rule</dt>
                <dd>
                  <Badge tone="brand">{result.ruleName}</Badge>
                </dd>
              </div>
              <div className="flex items-center justify-between gap-3">
                <dt className="text-muted">Weight billing</dt>
                <dd className="text-ink tabular-nums">
                  {weightKg} kg (billed as {Math.ceil(parseFloat(weightKg))} kg)
                </dd>
              </div>
              <div className="flex items-center justify-between gap-3">
                <dt className="text-muted">Trip</dt>
                <dd className="inline-flex items-center gap-1 text-ink capitalize">
                  <MapPin className="h-3 w-3 text-subtle" aria-hidden="true" />
                  {pickupCity} → {dropoffCity}
                </dd>
              </div>
            </dl>
          </div>
        )}
      </CardBody>
    </Card>
  );
}
