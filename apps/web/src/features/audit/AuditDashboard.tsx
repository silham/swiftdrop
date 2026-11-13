'use client';

import { ArrowRight, Copy, Eye, ScrollText, SlidersHorizontal } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Alert,
  Avatar,
  Badge,
  Button,
  Card,
  CardHeader,
  Drawer,
  EmptyState,
  FormField,
  Input,
  KeyValue,
  Pagination,
  Select,
  Skeleton,
  Table,
  Tabs,
  type BadgeTone,
  type Column,
} from '@/components/ui';
import { formatDateTime, formatRelative } from '@/lib/format';
import { errorMessage } from '@/lib/api/errors';
import { api } from '@/lib/api/client';

export type AuditActor = {
  id: string;
  name: string;
  email: string;
  role: string;
};

export type AuditPerson = {
  id: string;
  name: string;
  email: string;
};

export type AuditLog = {
  id: string;
  action: string;
  entityType: string;
  entityId: string;
  actor: AuditActor | null;
  actorRole: string | null;
  affectedPerson: AuditPerson | null;
  timestamp: string;
  metadata: Record<string, unknown> | null;
};

export type AuditLogPage = {
  data: AuditLog[];
  meta: { page: number; pageSize: number; total: number };
};

type UserOption = { id: string; name: string; email: string };
type UserLookupPage = {
  data: UserOption[];
  meta: { page: number; pageSize: number; total: number };
};
type AuditMode = 'person' | 'all';
type AuditFilters = {
  mode: AuditMode;
  action: string;
  entityType: string;
  entityId: string;
  actorId: string;
  from: string;
  to: string;
};

const emptyFilters: AuditFilters = {
  mode: 'all',
  action: '',
  entityType: '',
  entityId: '',
  actorId: '',
  from: '',
  to: '',
};

// Must match the action names modules pass to AuditService.record().
const actions = [
  'user.created',
  'user.role_changed',
  'user.status_changed',
  'user.updated',
  'merchant.approved',
  'merchant.rejected',
  'merchant.suspended',
  'api_key.created',
  'api_key.revoked',
  'webhook_secret.rotated',
  'zone.created',
  'zone.updated',
  'pricing_rule.created',
  'pricing_rule.updated',
  'parcel.assigned',
  'parcel.unassigned',
  'webhook_attempt.retried',
];

function queryFromFilters(filters: AuditFilters, page: number, pageSize: number) {
  return {
    page,
    pageSize,
    ...(filters.action ? { action: filters.action } : {}),
    ...(filters.entityType ? { entityType: filters.entityType } : {}),
    ...(filters.entityId ? { entityId: filters.entityId } : {}),
    ...(filters.actorId ? { actorId: filters.actorId } : {}),
    ...(filters.from ? { from: filters.from } : {}),
    ...(filters.to ? { to: filters.to } : {}),
  };
}

function LoadingRows() {
  return (
    <div className="space-y-2 p-5" aria-label="Loading audit logs" aria-busy="true">
      {Array.from({ length: 6 }, (_, index) => (
        <Skeleton key={index} className="h-11 w-full" />
      ))}
    </div>
  );
}

function Person({
  person,
  fallback,
}: {
  person: AuditPerson | AuditActor | null;
  fallback: string;
}) {
  if (!person) return <span className="text-sm text-muted">{fallback}</span>;
  return (
    <span className="flex min-w-0 items-center gap-2.5">
      <Avatar name={person.name} size="sm" />
      <span className="min-w-0">
        <span className="block truncate text-sm font-medium text-ink">{person.name}</span>
        <span className="block truncate text-xs text-muted">{person.email}</span>
      </span>
    </span>
  );
}

function actionTone(action: string): BadgeTone {
  if (/(rejected|suspended|revoked|unassigned)$/.test(action)) return 'danger';
  if (/(approved|created)$/.test(action)) return 'success';
  if (/(retried|rotated|role_changed|status_changed)$/.test(action)) return 'warning';
  return 'info';
}

function hasMetadata(entry: AuditLog) {
  return Boolean(entry.metadata && Object.keys(entry.metadata).length > 0);
}

/** Metadata for the details drawer; role changes get a readable before → after view. */
function MetadataDetails({ entry }: { entry: AuditLog }) {
  const metadata = entry.metadata;
  if (entry.action === 'user.role_changed') {
    const previousRole = metadata?.previousRole;
    const newRole = metadata?.newRole;
    if (typeof previousRole === 'string' || typeof newRole === 'string') {
      return (
        <div className="flex flex-wrap items-center gap-2 text-sm">
          {typeof previousRole === 'string' && <Badge tone="neutral">{previousRole}</Badge>}
          <ArrowRight className="h-4 w-4 text-subtle" aria-hidden="true" />
          {typeof newRole === 'string' && <Badge tone="brand">{newRole}</Badge>}
        </div>
      );
    }
  }
  if (!metadata || Object.keys(metadata).length === 0)
    return <p className="text-sm text-muted">No additional details were recorded.</p>;
  return (
    <pre className="overflow-x-auto rounded-lg border border-line bg-surface-2 p-4 font-mono text-xs break-words whitespace-pre-wrap text-ink">
      {JSON.stringify(metadata, null, 2)}
    </pre>
  );
}

export function AuditDashboard({
  initialData,
  initialError,
}: {
  initialData: AuditLogPage | null;
  initialError?: string;
}) {
  const [filters, setFilters] = useState(emptyFilters);
  const [draft, setDraft] = useState(emptyFilters);
  const [personName, setPersonName] = useState('');
  const [selectedEmail, setSelectedEmail] = useState('');
  const [users, setUsers] = useState<UserOption[]>([]);
  const [lookupLoading, setLookupLoading] = useState(false);
  const [lookupError, setLookupError] = useState<string>();
  const [lookupPage, setLookupPage] = useState(0);
  const [lookupTotal, setLookupTotal] = useState(0);
  const lookupRequestRef = useRef(0);
  const [data, setData] = useState<AuditLogPage | null>(initialData);
  const [error, setError] = useState(initialError);
  const [loading, setLoading] = useState(false);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [detail, setDetail] = useState<AuditLog | null>(null);
  const pageSize = data?.meta.pageSize ?? 20;
  const currentPage = data?.meta.page ?? 1;
  const totalPages = Math.max(1, Math.ceil((data?.meta.total ?? 0) / pageSize));
  const matchingUsers = useMemo(
    () =>
      users.filter((user) =>
        user.name.toLocaleLowerCase().includes(personName.trim().toLocaleLowerCase()),
      ),
    [personName, users],
  );

  useEffect(() => {
    const name = personName.trim();
    const requestId = ++lookupRequestRef.current;
    if (draft.mode !== 'person' || !name) {
      return;
    }
    const timer = window.setTimeout(async () => {
      setLookupLoading(true);
      setLookupError(undefined);
      const response = (await api.GET('/api/v1/admin/audit-logs/users', {
        params: { query: { search: name, page: 1, pageSize: 100 } },
      })) as unknown as { data?: UserLookupPage; error?: unknown };
      if (requestId !== lookupRequestRef.current) return;
      if (response.error || !response.data) {
        setUsers([]);
        setLookupError(errorMessage(response.error, 'Could not search users'));
        setLookupPage(0);
        setLookupTotal(0);
      } else {
        setUsers(response.data.data);
        setLookupPage(response.data.meta.page);
        setLookupTotal(response.data.meta.total);
      }
      setLookupLoading(false);
    }, 300);
    return () => window.clearTimeout(timer);
  }, [personName, draft.mode]);

  async function loadMoreUsers() {
    const name = personName.trim();
    if (!name || lookupLoading || lookupPage === 0 || lookupPage * 100 >= lookupTotal) {
      return;
    }

    const requestId = lookupRequestRef.current;
    setLookupLoading(true);
    setLookupError(undefined);
    const response = (await api
      .GET('/api/v1/admin/audit-logs/users', {
        params: { query: { search: name, page: lookupPage + 1, pageSize: 100 } },
      })
      .catch((error: unknown) => ({ data: undefined, error }))) as unknown as {
      data?: UserLookupPage;
      error?: unknown;
    };
    if (requestId !== lookupRequestRef.current) return;
    if (response.error || !response.data) {
      setLookupError(errorMessage(response.error, 'Could not load more users'));
    } else {
      setUsers((current) => {
        const existingIds = new Set(current.map((user) => user.id));
        return [...current, ...response.data!.data.filter((user) => !existingIds.has(user.id))];
      });
      setLookupPage(response.data.meta.page);
      setLookupTotal(response.data.meta.total);
    }
    setLookupLoading(false);
  }

  async function load(nextFilters: AuditFilters, page: number) {
    setLoading(true);
    setError(undefined);
    // A network failure rejects instead of returning { error }; treat it as an error result.
    const response = (await api
      .GET('/api/v1/admin/audit-logs', {
        params: { query: queryFromFilters(nextFilters, page, pageSize) },
      })
      .catch((error: unknown) => ({ data: undefined, error }))) as unknown as {
      data?: unknown;
      error?: unknown;
    };
    const result = response.data as unknown as AuditLogPage | undefined;
    if (response.error || !result)
      setError(errorMessage(response.error, 'Could not load audit logs'));
    else setData(result);
    setLoading(false);
  }

  function updateDraft(name: keyof AuditFilters, value: string) {
    setDraft((current) => ({ ...current, [name]: value }));
  }

  function updateMode(mode: AuditMode) {
    setDraft((current) => ({
      ...current,
      mode,
      entityType: mode === 'person' ? 'User' : '',
      entityId: '',
    }));
    setPersonName('');
    setSelectedEmail('');
    setUsers([]);
    setLookupError(undefined);
    setLookupLoading(false);
  }

  function updatePersonName(name: string) {
    setPersonName(name);
    setSelectedEmail('');
    setDraft((current) => ({ ...current, entityId: '' }));
    setUsers([]);
    setLookupError(undefined);
    setLookupLoading(false);
  }

  function chooseEmail(email: string) {
    setSelectedEmail(email);
    const user = matchingUsers.find((candidate) => candidate.email === email);
    setDraft((current) => ({ ...current, entityId: user?.id ?? '' }));
  }

  function applyFilters(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (
      draft.mode === 'person' &&
      (!personName.trim() ||
        !selectedEmail ||
        !draft.entityId ||
        !draft.from ||
        (draft.to && draft.to < draft.from))
    ) {
      return;
    }
    setFilters(draft);
    void load(draft, 1);
  }

  function clearFilters() {
    setDraft(emptyFilters);
    setFilters(emptyFilters);
    setPersonName('');
    setSelectedEmail('');
    void load(emptyFilters, 1);
  }

  function retry() {
    void load(filters, currentPage);
  }

  const personValid =
    personName.trim().length > 0 &&
    selectedEmail.length > 0 &&
    draft.entityId.length > 0 &&
    draft.from.length > 0 &&
    (!draft.to || draft.to >= draft.from);
  const canApply =
    draft.mode === 'all' ? !draft.to || !draft.from || draft.to >= draft.from : personValid;

  const activeFilterCount = [
    filters.action,
    filters.entityType && filters.mode === 'all' ? filters.entityType : '',
    filters.entityId,
    filters.actorId,
    filters.from,
    filters.to,
  ].filter(Boolean).length;

  const columns: Column<AuditLog>[] = [
    {
      header: 'Timestamp',
      cell: (entry) => (
        <time dateTime={entry.timestamp} className="block whitespace-nowrap">
          <span className="block text-sm text-ink">{formatRelative(entry.timestamp)}</span>
          <span className="block text-xs text-muted">{formatDateTime(entry.timestamp)}</span>
        </time>
      ),
    },
    {
      header: 'Performed by',
      cell: (entry) => <Person person={entry.actor} fallback="System" />,
    },
    {
      header: 'Affected person',
      cell: (entry) => <Person person={entry.affectedPerson} fallback="Unavailable" />,
    },
    {
      header: 'Action',
      cell: (entry) => (
        <Badge tone={actionTone(entry.action)} className="font-mono">
          {entry.action}
        </Badge>
      ),
    },
    {
      header: 'Entity',
      cell: (entry) => (
        <span className="block min-w-0">
          <span className="block text-sm text-ink">{entry.entityType}</span>
          <span
            className="block max-w-40 truncate font-mono text-xs text-muted"
            title={entry.entityId}
          >
            {entry.entityId}
          </span>
        </span>
      ),
    },
    {
      header: 'Details',
      headerClassName: 'text-right',
      className: 'px-4 py-2 text-right',
      cell: (entry) => (
        <Button
          type="button"
          variant="subtle"
          size="sm"
          onClick={() => setDetail(entry)}
          aria-label={`View details for ${entry.action} at ${formatDateTime(entry.timestamp)}`}
        >
          <Eye className="h-3.5 w-3.5" aria-hidden="true" />
          {hasMetadata(entry) ? 'View' : 'Open'}
        </Button>
      ),
    },
  ];

  return (
    <div className="space-y-5">
      <Card flush className="overflow-hidden">
        <form onSubmit={applyFilters}>
          <CardHeader
            className={filtersOpen ? undefined : '-mb-px'}
            title="Filters"
            description={
              draft.mode === 'person'
                ? 'Find everything that happened to one person.'
                : 'Browse all administrative and operational activity.'
            }
            icon={<SlidersHorizontal />}
            actions={
              <>
                <Tabs
                  label="Search mode"
                  value={draft.mode}
                  onChange={(value) => {
                    updateMode(value as AuditMode);
                    if (value === 'person') setFiltersOpen(true);
                  }}
                  items={[
                    { value: 'all', label: 'All Activity' },
                    { value: 'person', label: 'Search by Person' },
                  ]}
                />
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  onClick={() => setFiltersOpen((open) => !open)}
                  aria-expanded={filtersOpen}
                  aria-controls="audit-filter-panel"
                >
                  {filtersOpen ? 'Hide filters' : 'More filters'}
                  {activeFilterCount > 0 && <Badge tone="brand">{activeFilterCount}</Badge>}
                </Button>
              </>
            }
          />

          <div id="audit-filter-panel" hidden={!filtersOpen} className="space-y-5 p-5">
            {draft.mode === 'person' && (
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                <FormField label="Person name" htmlFor="audit-person">
                  <Input
                    id="audit-person"
                    value={personName}
                    onChange={(event) => updatePersonName(event.target.value)}
                    placeholder="Search by name"
                  />
                </FormField>
                <div className="space-y-1.5">
                  <label htmlFor="audit-email" className="block text-sm font-medium text-ink">
                    Email address
                  </label>
                  <Select
                    id="audit-email"
                    value={selectedEmail}
                    onChange={(event) => chooseEmail(event.target.value)}
                    disabled={lookupLoading || matchingUsers.length === 0}
                  >
                    <option value="">{lookupLoading ? 'Searching...' : 'Select an email'}</option>
                    {matchingUsers.map((user) => (
                      <option key={user.id} value={user.email}>
                        {user.email} ({user.name})
                      </option>
                    ))}
                  </Select>
                  {!lookupLoading && personName.trim() && matchingUsers.length === 0 && (
                    <p className="text-xs text-muted">No matching accounts found.</p>
                  )}
                  {lookupError && <p className="text-xs text-danger">{lookupError}</p>}
                  {matchingUsers.length > 0 && lookupPage * 100 < lookupTotal && (
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      disabled={lookupLoading}
                      onClick={() => void loadMoreUsers()}
                    >
                      {lookupLoading ? 'Loading...' : 'Load more users'}
                    </Button>
                  )}
                </div>
                <div className="space-y-1.5">
                  <label htmlFor="audit-person-id" className="block text-sm font-medium text-ink">
                    Entity ID
                  </label>
                  <div className="flex gap-2">
                    <Input
                      id="audit-person-id"
                      value={draft.entityId}
                      readOnly
                      placeholder="Selected automatically"
                      className="font-mono text-xs"
                    />
                    <Button
                      type="button"
                      variant="secondary"
                      size="icon"
                      disabled={!draft.entityId}
                      aria-label="Copy ID"
                      title="Copy ID"
                      onClick={() =>
                        void navigator.clipboard
                          .writeText(draft.entityId)
                          .catch(() => setError('Could not copy the Entity ID'))
                      }
                    >
                      <Copy className="h-4 w-4" aria-hidden="true" />
                    </Button>
                  </div>
                </div>
              </div>
            )}

            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <FormField
                label={draft.mode === 'person' ? 'Start date' : 'Start date (optional)'}
                htmlFor="audit-from"
                help={
                  draft.mode === 'person' && !draft.from ? 'Start date is required.' : undefined
                }
              >
                <Input
                  id="audit-from"
                  type="date"
                  value={draft.from}
                  onChange={(event) => updateDraft('from', event.target.value)}
                  required={draft.mode === 'person'}
                />
              </FormField>
              <FormField
                label="End date (optional)"
                htmlFor="audit-to"
                error={
                  draft.to && draft.from && draft.to < draft.from
                    ? 'End date cannot be earlier than start date.'
                    : undefined
                }
              >
                <Input
                  id="audit-to"
                  type="date"
                  min={draft.from || undefined}
                  value={draft.to}
                  onChange={(event) => updateDraft('to', event.target.value)}
                />
              </FormField>
              <FormField label="Action" htmlFor="audit-action">
                <Select
                  id="audit-action"
                  value={draft.action}
                  onChange={(event) => updateDraft('action', event.target.value)}
                >
                  <option value="">All actions</option>
                  {actions.map((action) => (
                    <option key={action} value={action}>
                      {action}
                    </option>
                  ))}
                </Select>
              </FormField>
              <FormField label="Entity type" htmlFor="audit-entity-type">
                <Input
                  id="audit-entity-type"
                  value={draft.entityType}
                  onChange={(event) => updateDraft('entityType', event.target.value)}
                  placeholder={draft.mode === 'person' ? 'User' : 'All entity types'}
                />
              </FormField>
              <FormField label="Actor ID" htmlFor="audit-actor">
                <Input
                  id="audit-actor"
                  value={draft.actorId}
                  onChange={(event) => updateDraft('actorId', event.target.value)}
                  className="font-mono text-xs"
                />
              </FormField>
              {draft.mode === 'all' && (
                <FormField label="Entity ID" htmlFor="audit-entity-id">
                  <Input
                    id="audit-entity-id"
                    value={draft.entityId}
                    onChange={(event) => updateDraft('entityId', event.target.value)}
                    className="font-mono text-xs"
                  />
                </FormField>
              )}
            </div>
          </div>

          <div
            hidden={!filtersOpen}
            className="flex flex-wrap items-center justify-end gap-2 border-t border-line bg-surface-2/60 px-5 py-3"
          >
            <Button
              type="button"
              variant="subtle"
              size="sm"
              onClick={clearFilters}
              disabled={loading}
            >
              Clear filters
            </Button>
            <Button type="submit" size="sm" disabled={loading || !canApply}>
              Apply filters
            </Button>
          </div>
        </form>
      </Card>

      {error && (
        <Alert
          tone="error"
          action={
            <Button type="button" variant="secondary" size="sm" onClick={retry}>
              Retry
            </Button>
          }
        >
          {error}
        </Alert>
      )}

      <Card flush>
        <CardHeader
          title="Activity"
          description={
            data
              ? `${data.meta.total} record${data.meta.total === 1 ? '' : 's'}${
                  activeFilterCount ? ' matching your filters' : ''
                }`
              : 'Audit trail'
          }
          icon={<ScrollText />}
        />
        {loading ? (
          <LoadingRows />
        ) : data && data.data.length > 0 ? (
          <>
            <Table
              bare
              dense
              columns={columns}
              rows={data.data}
              rowKey={(entry) => entry.id}
              caption="Audit log entries"
            />
            <nav
              aria-label="Audit log pages"
              className="rounded-b-xl border-t border-line px-5 py-3"
            >
              <Pagination
                page={currentPage}
                pageSize={pageSize}
                total={data.meta.total}
                onPageChange={(page) => {
                  if (page >= 1 && page <= totalPages) void load(filters, page);
                }}
              />
            </nav>
          </>
        ) : (
          <EmptyState
            compact
            className="m-5"
            icon={<ScrollText aria-hidden="true" />}
            title="No audit records found"
            description="Try adjusting the filters or check back after administrative activity occurs."
          />
        )}
      </Card>

      <Drawer
        open={detail !== null}
        onClose={() => setDetail(null)}
        title={detail ? detail.action : 'Audit entry'}
        description={detail ? formatDateTime(detail.timestamp) : undefined}
      >
        {detail && (
          <div className="space-y-6">
            <KeyValue
              columns={2}
              items={[
                {
                  label: 'Performed by',
                  value: <Person person={detail.actor} fallback="System" />,
                },
                {
                  label: 'Actor role',
                  value: detail.actor?.role ?? detail.actorRole ?? 'SYSTEM',
                },
                {
                  label: 'Affected person',
                  value: <Person person={detail.affectedPerson} fallback="Unavailable" />,
                },
                {
                  label: 'Action',
                  value: (
                    <Badge tone={actionTone(detail.action)} className="font-mono">
                      {detail.action}
                    </Badge>
                  ),
                },
                { label: 'Entity type', value: detail.entityType },
                {
                  label: 'Entity ID',
                  value: <code className="font-mono text-xs break-all">{detail.entityId}</code>,
                },
              ]}
            />
            <div>
              <h3 className="mb-2 text-sm font-semibold text-ink">Details</h3>
              <MetadataDetails entry={detail} />
            </div>
          </div>
        )}
      </Drawer>
    </div>
  );
}
