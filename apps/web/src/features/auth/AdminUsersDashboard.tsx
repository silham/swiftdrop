'use client';

import { Search, ShieldCheck, Store, UserPlus, Users, UserCheck } from 'lucide-react';
import { useState } from 'react';
import {
  Alert,
  Avatar,
  Badge,
  Button,
  Card,
  CardHeader,
  EmptyState,
  Input,
  Select,
  Skeleton,
  StatCard,
  StatGrid,
  Table,
  Tabs,
  Toolbar,
  type BadgeTone,
  type Column,
} from '@/components/ui';
import { formatDate, formatNumber } from '@/lib/format';
import { api } from '@/lib/api/client';
import { errorMessage } from '@/lib/api/errors';
import type { Role } from '@swiftdrop/contracts';
import { CreateStaffModal } from './CreateStaffModal';

export interface UserRow {
  id: string;
  email: string;
  name: string;
  role: Role;
  isActive: boolean;
  phone: string | null;
  createdAt: string;
}

interface AdminUsersDashboardProps {
  initialUsers: UserRow[];
  initialTotal: number;
}

const ROLE_TONE: Record<Role, BadgeTone> = {
  ADMIN: 'violet',
  DISPATCHER: 'info',
  COURIER: 'warning',
  MERCHANT: 'success',
  CUSTOMER: 'neutral',
};

const ROLE_LABEL: Record<Role, string> = {
  ADMIN: 'Admin',
  DISPATCHER: 'Dispatcher',
  COURIER: 'Courier',
  MERCHANT: 'Merchant',
  CUSTOMER: 'Customer',
};

const STAFF_ROLES: Role[] = ['ADMIN', 'DISPATCHER', 'COURIER'];

const ROLES_LIST: { label: string; value: Role | 'ALL' }[] = [
  { label: 'All Users', value: 'ALL' },
  { label: 'Couriers', value: 'COURIER' },
  { label: 'Dispatchers', value: 'DISPATCHER' },
  { label: 'Admins', value: 'ADMIN' },
  { label: 'Merchants', value: 'MERCHANT' },
  { label: 'Customers', value: 'CUSTOMER' },
];

type StatusFilter = 'ALL' | 'ACTIVE' | 'DISABLED';

const STATUS_TABS: { value: StatusFilter; label: string }[] = [
  { value: 'ALL', label: 'Any status' },
  { value: 'ACTIVE', label: 'Active' },
  { value: 'DISABLED', label: 'Disabled' },
];

export function AdminUsersDashboard({ initialUsers, initialTotal }: AdminUsersDashboardProps) {
  const [users, setUsers] = useState<UserRow[]>(initialUsers);
  // Unfiltered snapshot (first page) that powers the KPI tiles; kept in sync with local edits.
  const [baseline, setBaseline] = useState<UserRow[]>(initialUsers);
  const [roleFilter, setRoleFilter] = useState<Role | 'ALL'>('ALL');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('ALL');
  const [search, setSearch] = useState('');
  const [modalOpen, setModalOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string>();
  const [updatingId, setUpdatingId] = useState<string>();

  async function loadUsers(
    targetRole = roleFilter,
    targetSearch = search,
    targetStatus = statusFilter,
  ) {
    setLoading(true);
    setError(undefined);

    const query: {
      page: number;
      pageSize: number;
      role?: Role;
      search?: string;
      isActive?: boolean;
    } = {
      page: 1,
      pageSize: 100,
    };
    if (targetRole !== 'ALL') query.role = targetRole;
    if (targetSearch.trim()) query.search = targetSearch.trim();
    if (targetStatus !== 'ALL') query.isActive = targetStatus === 'ACTIVE';

    const { data, error: apiErr } = await api.GET('/api/v1/admin/users', {
      params: { query },
    });

    setLoading(false);

    if (apiErr || !data) {
      return setError(errorMessage(apiErr, 'Failed to fetch users'));
    }

    const rows = (data.data as unknown as UserRow[]) ?? [];
    setUsers(rows);
    if (targetRole === 'ALL' && !targetSearch.trim() && targetStatus === 'ALL') setBaseline(rows);
  }

  async function handleToggleActive(user: UserRow) {
    const nextState = !user.isActive;
    const confirmMessage = nextState
      ? `Re-activate ${user.name}'s account?`
      : `Deactivate ${user.name}? This will immediately terminate all active sessions.`;

    if (!window.confirm(confirmMessage)) return;

    setUpdatingId(user.id);
    setError(undefined);

    const { data, error: apiErr } = await api.PATCH('/api/v1/admin/users/{id}', {
      params: { path: { id: user.id } },
      body: { isActive: nextState },
    });

    setUpdatingId(undefined);

    if (apiErr || !data) {
      return setError(errorMessage(apiErr, 'Failed to update account status'));
    }

    const toggle = (prev: UserRow[]) =>
      prev.map((u) => (u.id === user.id ? { ...u, isActive: nextState } : u));
    setUsers(toggle);
    setBaseline(toggle);
  }

  async function handleRoleChange(user: UserRow, newRole: Role) {
    if (user.role === newRole) return;
    if (!window.confirm(`Change ${user.name}'s role to ${newRole}?`)) return;

    setUpdatingId(user.id);
    setError(undefined);

    const { data, error: apiErr } = await api.PATCH('/api/v1/admin/users/{id}', {
      params: { path: { id: user.id } },
      body: { role: newRole },
    });

    setUpdatingId(undefined);

    if (apiErr || !data) {
      return setError(errorMessage(apiErr, 'Failed to update role'));
    }

    const change = (prev: UserRow[]) =>
      prev.map((u) => (u.id === user.id ? { ...u, role: newRole } : u));
    setUsers(change);
    setBaseline(change);
  }

  function handleSearchSubmit(e: React.FormEvent) {
    e.preventDefault();
    loadUsers(roleFilter, search);
  }

  const columns: Column<UserRow>[] = [
    {
      header: 'User',
      cell: (u) => (
        <div className="flex items-center gap-3">
          <Avatar name={u.name} size="sm" />
          <div className="min-w-0">
            <div className="truncate font-medium text-ink">{u.name}</div>
            <div className="truncate text-xs text-muted">{u.email}</div>
          </div>
        </div>
      ),
    },
    {
      header: 'Role',
      cell: (u) => <Badge tone={ROLE_TONE[u.role]}>{ROLE_LABEL[u.role]}</Badge>,
    },
    {
      header: 'Phone',
      cell: (u) => <span className="text-xs text-muted tabular-nums">{u.phone ?? '—'}</span>,
    },
    {
      header: 'Status',
      cell: (u) => (
        <Badge tone={u.isActive ? 'success' : 'danger'} dot>
          {u.isActive ? 'Active' : 'Disabled'}
        </Badge>
      ),
    },
    {
      header: 'Joined',
      cell: (u) => <span className="text-xs text-muted">{formatDate(u.createdAt)}</span>,
    },
    {
      header: 'Actions',
      headerClassName: 'text-right',
      className: 'px-4 py-3 text-right',
      cell: (u) => (
        <div className="flex items-center justify-end gap-2">
          <div className="w-32">
            <Select
              aria-label={`Role for ${u.name}`}
              value={u.role}
              disabled={updatingId === u.id}
              onChange={(e) => handleRoleChange(u, e.target.value as Role)}
              className="py-1 text-xs"
            >
              <option value="CUSTOMER">Customer</option>
              <option value="COURIER">Courier</option>
              <option value="DISPATCHER">Dispatcher</option>
              <option value="MERCHANT">Merchant</option>
              <option value="ADMIN">Admin</option>
            </Select>
          </div>

          <Button
            variant={u.isActive ? 'secondary' : 'primary'}
            size="sm"
            disabled={updatingId === u.id}
            onClick={() => handleToggleActive(u)}
            className="w-24"
          >
            {updatingId === u.id ? '…' : u.isActive ? 'Deactivate' : 'Activate'}
          </Button>
        </div>
      ),
    },
  ];

  const activeCount = baseline.filter((u) => u.isActive).length;
  const staffCount = baseline.filter((u) => STAFF_ROLES.includes(u.role)).length;
  const customerCount = baseline.filter((u) => u.role === 'CUSTOMER').length;
  const merchantCount = baseline.filter((u) => u.role === 'MERCHANT').length;
  const sampled = baseline.length < initialTotal;

  return (
    <div className="space-y-6">
      <StatGrid cols={4}>
        <StatCard
          label="Total users"
          value={formatNumber(initialTotal)}
          icon={<Users />}
          tone="brand"
          hint="All registered accounts"
        />
        <StatCard
          label="Active accounts"
          value={formatNumber(activeCount)}
          icon={<UserCheck />}
          tone="success"
          hint={
            baseline.length
              ? `${Math.round((activeCount / baseline.length) * 100)}% of ${sampled ? 'loaded' : 'all'} accounts`
              : undefined
          }
        />
        <StatCard
          label="Staff"
          value={formatNumber(staffCount)}
          icon={<ShieldCheck />}
          tone="violet"
          hint="Admins, dispatchers & couriers"
        />
        <StatCard
          label="Customers / Merchants"
          value={`${formatNumber(customerCount)} / ${formatNumber(merchantCount)}`}
          icon={<Store />}
          tone="info"
          hint={sampled ? `From the first ${baseline.length} accounts` : 'Self-service accounts'}
        />
      </StatGrid>

      {error && <Alert tone="error">{error}</Alert>}

      <Card flush>
        <CardHeader
          title="Accounts"
          description="Search, filter by role, change roles and enable or disable access."
          icon={<Users />}
          actions={
            <Button size="sm" onClick={() => setModalOpen(true)}>
              <UserPlus className="h-4 w-4" aria-hidden="true" />
              Create Staff
            </Button>
          }
        />
        <div className="border-b border-line px-5 py-3">
          <Toolbar
            end={
              <form onSubmit={handleSearchSubmit} className="flex gap-2" role="search">
                <div className="relative">
                  <Search
                    className="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-subtle"
                    aria-hidden="true"
                  />
                  <Input
                    type="search"
                    aria-label="Search users"
                    placeholder="Search by name or email…"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    className="w-56 pl-9 sm:w-64"
                  />
                </div>
                <Button type="submit" variant="secondary">
                  Search
                </Button>
              </form>
            }
          >
            <Tabs
              label="Filter by role"
              value={roleFilter}
              onChange={(value) => {
                const next = value as Role | 'ALL';
                setRoleFilter(next);
                loadUsers(next, search);
              }}
              items={ROLES_LIST.map((tab) => ({
                value: tab.value,
                label: tab.label,
                count: !sampled
                  ? tab.value === 'ALL'
                    ? baseline.length
                    : baseline.filter((u) => u.role === tab.value).length
                  : undefined,
              }))}
            />
            <Tabs
              label="Filter by status"
              value={statusFilter}
              onChange={(value) => {
                const next = value as StatusFilter;
                setStatusFilter(next);
                loadUsers(roleFilter, search, next);
              }}
              items={STATUS_TABS}
            />
          </Toolbar>
        </div>

        {loading ? (
          <div className="space-y-3 p-5" aria-busy="true" aria-label="Loading user accounts">
            {[1, 2, 3, 4, 5].map((i) => (
              <Skeleton key={i} className="h-10 w-full" />
            ))}
          </div>
        ) : (
          <Table
            bare
            columns={columns}
            rows={users}
            rowKey={(u) => u.id}
            caption="User accounts"
            empty={
              <div className="p-5">
                <EmptyState
                  compact
                  title="No users found"
                  description={
                    search || roleFilter !== 'ALL' || statusFilter !== 'ALL'
                      ? 'Try adjusting your search criteria or filters.'
                      : 'There are no user accounts registered in the system yet.'
                  }
                  action={
                    <Button
                      variant="secondary"
                      onClick={() => {
                        setRoleFilter('ALL');
                        setStatusFilter('ALL');
                        setSearch('');
                        loadUsers('ALL', '', 'ALL');
                      }}
                    >
                      Reset Filters
                    </Button>
                  }
                />
              </div>
            }
          />
        )}
      </Card>

      <CreateStaffModal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        onCreated={() => loadUsers(roleFilter, search)}
      />
    </div>
  );
}
