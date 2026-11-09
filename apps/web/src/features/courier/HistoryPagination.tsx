'use client';

import { Pagination } from '@/components/ui';

/**
 * Client wrapper so the server-rendered history page can use the kit Pagination with URL links
 * (functions such as hrefFor cannot be passed from a server component). Owner: M6.
 */
export function HistoryPagination({
  page,
  pageSize,
  total,
}: {
  page: number;
  pageSize: number;
  total: number;
}) {
  return (
    <Pagination
      page={page}
      pageSize={pageSize}
      total={total}
      hrefFor={(target) => `/courier/history?page=${target}`}
    />
  );
}
