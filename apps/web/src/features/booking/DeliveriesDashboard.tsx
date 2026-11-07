import { PARCEL_STATUSES, type ParcelStatus } from '@swiftdrop/contracts';
import {
  ArrowRight,
  CircleCheck,
  CircleX,
  MapPin,
  Package,
  PackagePlus,
  Receipt,
  Search,
  Truck,
} from 'lucide-react';
import Link from 'next/link';
import {
  buttonClasses,
  Card,
  CardBody,
  CardHeader,
  EmptyState,
  KeyValue,
  PageHeader,
  ProgressBar,
  STATUS_LABEL,
  StatCard,
  StatGrid,
  StatusBadge,
  Table,
  Tabs,
} from '@/components/ui';
import { formatDate, formatDateTime, formatNumber } from '@/lib/format';
import type { components } from '@/lib/api/schema';
import { CustomerPagination } from './CustomerPagination';
import { ProofOfDeliveryPhoto } from './ProofOfDeliveryPhoto';

type DeliveryPage = components['schemas']['ParcelPageDto'];
type Delivery = components['schemas']['ParcelDto'];
type CustomerParcel = components['schemas']['CustomerParcelDetailDto'];

/** Per-status counts for the KPI row; `null` means that count could not be loaded. */
export interface DeliverySummary {
  total: number | null;
  delivered: number | null;
  failed: number | null;
}

function formatFee(feeCents: number, currency: string) {
  return new Intl.NumberFormat('en-LK', {
    style: 'currency',
    currency,
    minimumFractionDigits: 2,
  }).format(feeCents / 100);
}

const PROGRESS_STEPS: ParcelStatus[] = [
  'CREATED',
  'PICKED_UP',
  'IN_TRANSIT',
  'OUT_FOR_DELIVERY',
  'DELIVERED',
];

export function BookingLink({ compact = false }: { compact?: boolean }) {
  return (
    <Link
      href="/customer/book"
      className={buttonClasses({ variant: 'primary', size: compact ? 'md' : 'md' })}
    >
      <PackagePlus className="h-4 w-4" aria-hidden="true" />
      Book a delivery
    </Link>
  );
}

export function DeliverySummaryTiles({ summary }: { summary: DeliverySummary }) {
  const { total, delivered, failed } = summary;
  const active =
    total != null && delivered != null && failed != null ? total - delivered - failed : null;
  const successRate =
    delivered != null && failed != null && delivered + failed > 0
      ? Math.round((delivered / (delivered + failed)) * 100)
      : null;
  return (
    <StatGrid cols={4}>
      <StatCard
        label="Active"
        value={formatNumber(active)}
        icon={<Truck />}
        tone="brand"
        hint="On the way or awaiting pickup"
        href="/customer"
      />
      <StatCard
        label="Delivered"
        value={formatNumber(delivered)}
        icon={<CircleCheck />}
        tone="success"
        hint={successRate != null ? `${successRate}% success rate` : 'Completed deliveries'}
        href="/customer?status=DELIVERED"
      />
      <StatCard
        label="Failed"
        value={formatNumber(failed)}
        icon={<CircleX />}
        tone="danger"
        hint="Delivery attempts that failed"
        href="/customer?status=FAILED"
      />
      <StatCard
        label="Total"
        value={formatNumber(total)}
        icon={<Package />}
        tone="neutral"
        hint="All bookings on your account"
      />
    </StatGrid>
  );
}

function statusHref(status?: ParcelStatus) {
  return status ? `/customer?status=${status}` : '/customer';
}

export function DeliveriesDashboard({
  result,
  status,
  summary,
}: {
  result: DeliveryPage;
  status?: ParcelStatus;
  summary?: DeliverySummary;
}) {
  const { data: deliveries, meta } = result;
  const columns = [
    {
      header: 'Tracking number',
      cell: (delivery: Delivery) => (
        <Link
          href={`/customer/parcels/${delivery.id}`}
          className="font-mono text-sm font-medium text-ink hover:text-brand"
        >
          {delivery.trackingNumber}
        </Link>
      ),
    },
    {
      header: 'Recipient',
      cell: (delivery: Delivery) => (
        <div className="min-w-0">
          <p className="truncate text-ink">{delivery.recipientName}</p>
          <p className="truncate text-xs text-muted capitalize">{delivery.dropoffCity}</p>
        </div>
      ),
    },
    {
      header: 'Status',
      cell: (delivery: Delivery) => <StatusBadge status={delivery.status} />,
    },
    {
      header: 'Booked',
      cell: (delivery: Delivery) => formatDate(delivery.createdAt),
      className: 'whitespace-nowrap px-4 py-3 text-muted',
    },
    {
      header: 'Fee',
      cell: (delivery: Delivery) => formatFee(delivery.feeCents, delivery.currency),
      className: 'whitespace-nowrap px-4 py-3 text-right font-medium tabular-nums',
      headerClassName: 'text-right',
    },
    {
      header: 'Details',
      cell: (delivery: Delivery) => (
        <Link
          href={`/customer/parcels/${delivery.id}`}
          className="inline-flex items-center gap-1 text-xs font-medium text-brand hover:text-brand-hover"
          aria-label={`View delivery ${delivery.trackingNumber}`}
        >
          View <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
        </Link>
      ),
      className: 'px-4 py-3 text-right',
      headerClassName: 'text-right',
    },
  ];

  const tabs = [
    { value: 'ALL', label: 'All', href: statusHref() },
    ...PARCEL_STATUSES.map((s) => ({ value: s, label: STATUS_LABEL[s], href: statusHref(s) })),
  ];

  return (
    <div className="space-y-6">
      {summary && <DeliverySummaryTiles summary={summary} />}

      <div className="grid gap-6 xl:grid-cols-4">
        <Card flush className="min-w-0 xl:col-span-3">
          <CardHeader
            title="Deliveries"
            description={
              status
                ? `${formatNumber(meta.total)} ${STATUS_LABEL[status].toLowerCase()} deliveries`
                : `${formatNumber(meta.total)} deliveries booked`
            }
            icon={<Package />}
          />
          <div className="border-b border-line px-5 py-3">
            <Tabs items={tabs} value={status ?? 'ALL'} label="Filter by status" />
          </div>
          {deliveries.length === 0 ? (
            <div className="p-5">
              <EmptyState
                compact
                className="border-0"
                title={status ? 'No deliveries match this status' : 'No deliveries yet'}
                description={
                  status
                    ? 'Try another status or clear the filter.'
                    : 'Book your first delivery to receive a tracking number.'
                }
                action={
                  <div className="flex flex-wrap justify-center gap-3">
                    {status && (
                      <Link href="/customer" className={buttonClasses({ variant: 'secondary' })}>
                        Clear filter
                      </Link>
                    )}
                    <BookingLink />
                  </div>
                }
              />
            </div>
          ) : (
            <Table
              bare
              columns={columns}
              rows={deliveries}
              rowKey={(delivery) => delivery.id}
              caption="Your deliveries"
            />
          )}
          {meta.total > 0 && (
            <nav aria-label="Delivery pages" className="border-t border-line px-5 py-3">
              <CustomerPagination
                page={meta.page}
                pageSize={meta.pageSize}
                total={meta.total}
                status={status}
              />
            </nav>
          )}
        </Card>

        <div className="space-y-6">
          <Card flush>
            <CardHeader
              title="Track a parcel"
              description="Follow any SwiftDrop delivery live."
              icon={<Search />}
              titleAs="h2"
            />
            <CardBody className="space-y-3 text-sm text-muted">
              <p>Have a tracking number from someone else? Look it up on the public tracker.</p>
              <Link
                href="/track"
                className={buttonClasses({ variant: 'secondary', className: 'w-full' })}
              >
                Open tracker <ArrowRight className="h-4 w-4" aria-hidden="true" />
              </Link>
            </CardBody>
          </Card>
          <Card flush className="overflow-hidden">
            <div className="bg-sidebar p-5 text-sidebar-ink">
              <PackagePlus className="h-6 w-6 text-logo-orange" aria-hidden="true" />
              <p className="mt-3 font-semibold">Send something new</p>
              <p className="mt-1 text-sm text-sidebar-muted">
                Get an instant price and a tracking number in under a minute.
              </p>
              <Link
                href="/customer/book"
                className={buttonClasses({ variant: 'primary', className: 'mt-4 w-full' })}
              >
                Book a delivery
              </Link>
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}

function RouteStop({
  label,
  name,
  address,
  city,
  tone,
}: {
  label: string;
  name: string;
  address: string;
  city: string;
  tone: 'origin' | 'destination';
}) {
  return (
    <div className="relative flex gap-3">
      <span
        className={
          tone === 'origin'
            ? 'mt-1 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-brand-soft text-brand'
            : 'mt-1 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-success-soft text-success'
        }
        aria-hidden="true"
      >
        <MapPin className="h-3.5 w-3.5" />
      </span>
      <div className="min-w-0">
        <p className="text-xs font-semibold tracking-wider text-muted uppercase">{label}</p>
        <p className="mt-0.5 text-base font-semibold text-ink capitalize">{city}</p>
        <p className="text-sm text-ink">{name}</p>
        <p className="text-sm text-muted">{address}</p>
      </div>
    </div>
  );
}

export function ParcelDetails({ parcel }: { parcel: CustomerParcel }) {
  const status = parcel.status as ParcelStatus;
  const reached =
    status === 'FAILED'
      ? Math.max(0, ...parcel.history.map((h) => PROGRESS_STEPS.indexOf(h.status as ParcelStatus)))
      : PROGRESS_STEPS.indexOf(status);
  const progress = ((Math.max(0, reached) + 1) / PROGRESS_STEPS.length) * 100;
  const latest = parcel.history.length - 1;

  return (
    <div>
      <PageHeader
        title={parcel.trackingNumber}
        description={`${parcel.pickupCity} to ${parcel.dropoffCity}`}
        meta={<StatusBadge status={status} />}
        breadcrumbs={[
          { label: 'My deliveries', href: '/customer' },
          { label: parcel.trackingNumber },
        ]}
        actions={
          <>
            <Link
              href={`/track/${encodeURIComponent(parcel.trackingNumber)}`}
              className={buttonClasses({ variant: 'secondary' })}
            >
              <Search className="h-4 w-4" aria-hidden="true" />
              Live tracking
            </Link>
            <a
              href={`/api/v1/parcels/${encodeURIComponent(parcel.id)}/receipt`}
              aria-label={`Download receipt for ${parcel.trackingNumber}`}
              className={buttonClasses({ variant: 'primary' })}
            >
              <Receipt className="h-4 w-4" aria-hidden="true" />
              Download receipt
            </a>
          </>
        }
      />

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="min-w-0 space-y-6 lg:col-span-2">
          <Card flush>
            <CardHeader
              title="Route"
              titleAs="h3"
              description={
                status === 'FAILED'
                  ? 'Delivery failed — see the timeline for details.'
                  : status === 'DELIVERED'
                    ? 'This parcel has been delivered.'
                    : `Step ${Math.max(0, reached) + 1} of ${PROGRESS_STEPS.length}`
              }
              icon={<Truck />}
            />
            <CardBody className="space-y-6">
              <ProgressBar
                value={progress}
                tone={status === 'FAILED' ? 'danger' : status === 'DELIVERED' ? 'success' : 'brand'}
                label="Delivery progress"
              />
              <div className="grid gap-6 sm:grid-cols-2">
                <RouteStop
                  label="Pickup"
                  name={parcel.senderName}
                  address={parcel.pickupAddress}
                  city={parcel.pickupCity}
                  tone="origin"
                />
                <RouteStop
                  label="Drop-off"
                  name={parcel.recipientName}
                  address={parcel.dropoffAddress}
                  city={parcel.dropoffCity}
                  tone="destination"
                />
              </div>
            </CardBody>
          </Card>

          <Card flush>
            <CardHeader
              title="Status timeline"
              description="Status updates recorded for this delivery."
            />
            <CardBody>
              {parcel.history.length > 0 ? (
                <ol className="space-y-5">
                  {parcel.history.map((entry, index) => {
                    const isLatest = index === latest;
                    return (
                      <li key={`${entry.status}-${entry.at}`} className="relative flex gap-4">
                        {index < latest && (
                          <span
                            className="absolute top-6 left-[11px] h-[calc(100%-0.25rem)] w-px bg-line"
                            aria-hidden="true"
                          />
                        )}
                        <span
                          className={
                            isLatest
                              ? 'relative mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-brand text-brand-fg ring-4 ring-brand-soft'
                              : 'relative mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-surface-2 text-muted ring-1 ring-line-strong'
                          }
                          aria-hidden="true"
                        >
                          <CircleCheck className="h-3.5 w-3.5" />
                        </span>
                        <div className="min-w-0 pb-1">
                          <p className="font-medium text-ink">
                            {STATUS_LABEL[entry.status as ParcelStatus]}
                          </p>
                          <time className="text-sm text-muted" dateTime={entry.at}>
                            {formatDateTime(entry.at)}
                          </time>
                          {entry.reason && (
                            <p className="mt-1 text-sm text-danger">{entry.reason}</p>
                          )}
                        </div>
                      </li>
                    );
                  })}
                </ol>
              ) : (
                <p className="text-sm text-muted">No status updates are available yet.</p>
              )}
            </CardBody>
          </Card>

          {parcel.status === 'DELIVERED' && (
            <ProofOfDeliveryPhoto parcelId={parcel.id} trackingNumber={parcel.trackingNumber} />
          )}
        </div>

        <div className="space-y-6">
          <Card flush>
            <CardHeader title="Parcel" icon={<Package />} />
            <CardBody>
              <KeyValue
                items={[
                  {
                    label: 'Size',
                    value: <span className="capitalize">{parcel.size.toLowerCase()}</span>,
                  },
                  { label: 'Weight', value: `${parcel.weightKg} kg` },
                  { label: 'Booked', value: formatDateTime(parcel.createdAt) },
                  ...(parcel.deliveredAt
                    ? [{ label: 'Delivered', value: formatDateTime(parcel.deliveredAt) }]
                    : []),
                ]}
              />
            </CardBody>
          </Card>
          <Card>
            <p className="text-xs font-medium tracking-wide text-muted uppercase">Delivery fee</p>
            <p className="mt-1 text-2xl font-semibold text-ink tabular-nums">
              {formatFee(parcel.feeCents, parcel.currency)}
            </p>
            <p className="mt-1 text-xs text-muted">
              Priced at booking. The receipt includes the full breakdown.
            </p>
          </Card>
        </div>
      </div>
    </div>
  );
}
