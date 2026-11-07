import type { Client } from 'openapi-fetch';
import { errorMessage } from '@/lib/api/errors';
import type { components, paths } from '@/lib/api/schema';
import type { CourierPerformance, DailyVolume, DeliverySummary } from './report-widgets';

/**
 * Loads every admin-overview widget in parallel. Works with the server client (page.tsx) and the
 * browser client (Retry). Each widget gets its own error so one failing endpoint never blanks the page.
 * Owner: M9.
 */
export type OverviewAudit = {
  id: string;
  action: string;
  entityType: string;
  actor: { name: string; role: string } | null;
  actorRole: string | null;
  timestamp: string;
};

export type QueueDepth = components['schemas']['QueueDepthDto'];

export type OverviewData = {
  summary?: DeliverySummary;
  dailyVolume?: DailyVolume[];
  couriers?: CourierPerformance[];
  audit?: { data: OverviewAudit[]; meta: { total: number } };
  health?: { pending: number; failing: number; queues?: QueueDepth[] };
  attention?: { pendingMerchants?: number; deadWebhooks?: number };
};

export type OverviewErrors = {
  summary?: string;
  dailyVolume?: string;
  couriers?: string;
  audit?: string;
  health?: string;
  attention?: string;
};

type Result = { data?: unknown; error?: unknown };
type Paged = { meta?: { total?: number } };

// A network failure rejects instead of returning { error }; normalise it.
const settle = (p: Promise<Result>): Promise<Result> =>
  p.catch((error: unknown) => ({ error: error ?? {} }));

export async function fetchOverview(
  client: Client<paths>,
): Promise<{ data: OverviewData; errors: OverviewErrors }> {
  const [summary, daily, couriers, audit, outbox, queues, merchants, dead] = await Promise.all([
    settle(client.GET('/api/v1/admin/reports/deliveries')),
    settle(client.GET('/api/v1/admin/reports/daily-volume')),
    settle(client.GET('/api/v1/admin/reports/couriers')),
    settle(client.GET('/api/v1/admin/audit-logs', { params: { query: { page: 1, pageSize: 6 } } })),
    settle(client.GET('/api/v1/admin/ops/outbox')),
    settle(client.GET('/api/v1/admin/ops/queues')),
    settle(
      client.GET('/api/v1/admin/merchants', {
        params: { query: { status: 'PENDING', page: 1, pageSize: 1 } },
      }),
    ),
    settle(
      client.GET('/api/v1/admin/ops/webhook-attempts', {
        params: { query: { status: 'DEAD', pageSize: 1 } },
      }),
    ),
  ]);

  const outboxData = outbox.data as { pending: number; failing: number } | undefined;
  const pendingMerchants = (merchants.data as Paged | undefined)?.meta?.total;
  const deadWebhooks = (dead.data as Paged | undefined)?.meta?.total;

  return {
    data: {
      summary: summary.data as DeliverySummary | undefined,
      dailyVolume: daily.data as DailyVolume[] | undefined,
      couriers: couriers.data as CourierPerformance[] | undefined,
      audit: audit.data as OverviewData['audit'] | undefined,
      health: outboxData
        ? { ...outboxData, queues: queues.data as QueueDepth[] | undefined }
        : undefined,
      attention:
        pendingMerchants != null || deadWebhooks != null
          ? { pendingMerchants, deadWebhooks }
          : undefined,
    },
    errors: {
      summary: summary.error
        ? errorMessage(summary.error, 'Could not load delivery summary')
        : undefined,
      dailyVolume: daily.error
        ? errorMessage(daily.error, 'Could not load daily delivery activity')
        : undefined,
      couriers: couriers.error
        ? errorMessage(couriers.error, 'Could not load courier performance')
        : undefined,
      audit: audit.error
        ? errorMessage(audit.error, 'Could not load recent audit activity')
        : undefined,
      health:
        outbox.error || queues.error
          ? errorMessage(outbox.error ?? queues.error, 'Could not load event pipeline health')
          : undefined,
      attention:
        merchants.error && dead.error
          ? errorMessage(merchants.error, 'Could not load items that need attention')
          : undefined,
    },
  };
}
