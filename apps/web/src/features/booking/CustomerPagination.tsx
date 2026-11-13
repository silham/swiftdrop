'use client';

import type { ParcelStatus } from '@swiftdrop/contracts';
import { Pagination } from '@/components/ui';

/**
 * Client wrapper so the server-rendered dashboard can use the kit Pagination with URL links
 * (functions such as hrefFor cannot be passed from a server component). Owner: M3.
 */
export function CustomerPagination({
  page,
  pageSize,
  total,
  status,
}: {
  page: number;
  pageSize: number;
  total: number;
  status?: ParcelStatus;
}) {
  return (
    <Pagination
      page={page}
      pageSize={pageSize}
      total={total}
      hrefFor={(target) => {
        const params = new URLSearchParams({ page: String(target) });
        if (status) params.set('status', status);
        return `/customer?${params.toString()}`;
      }}
    />
  );
}
