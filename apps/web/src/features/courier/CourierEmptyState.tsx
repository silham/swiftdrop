import { Bell, Camera, Truck } from 'lucide-react';
import { EmptyState } from '@/components/ui';

/** Friendly placeholder until the courier API (M6) returns data. */
export function CourierEmptyState({
  title = 'No deliveries assigned yet',
  description = 'Parcels appear here as soon as a dispatcher assigns them to you. Pull to refresh or check back shortly.',
}: {
  title?: string;
  description?: string;
}) {
  return <EmptyState title={title} description={description} icon={<Truck aria-hidden="true" />} />;
}

/** Three-step explainer shown under the empty state on the courier home screen. */
export function CourierHowItWorks() {
  const steps = [
    { Icon: Bell, title: 'Get assigned', text: 'Dispatch assigns parcels in your zone.' },
    {
      Icon: Truck,
      title: 'Pick up and go',
      text: 'Mark each parcel picked up and out for delivery.',
    },
    { Icon: Camera, title: 'Prove delivery', text: 'Capture a photo, or record why it failed.' },
  ];
  return (
    <ol className="grid gap-3 sm:grid-cols-3">
      {steps.map(({ Icon, title, text }, i) => (
        <li
          key={title}
          className="flex gap-3 rounded-xl border border-line bg-surface p-4 shadow-card"
        >
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-surface-2 text-muted">
            <Icon className="h-4 w-4" aria-hidden="true" />
          </span>
          <div>
            <p className="text-sm font-semibold text-ink">
              <span className="text-subtle">{i + 1}.</span> {title}
            </p>
            <p className="mt-0.5 text-xs text-muted">{text}</p>
          </div>
        </li>
      ))}
    </ol>
  );
}
