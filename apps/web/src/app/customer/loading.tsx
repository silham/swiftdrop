import { Skeleton } from '@/components/ui';

/** Applies to every /customer page; the skeleton matches the deliveries dashboard, the most common one. */
export default function CustomerLoading() {
  return (
    <div aria-label="Loading" aria-busy="true" className="space-y-6">
      <div className="flex items-end justify-between gap-4">
        <div className="space-y-2">
          <Skeleton className="h-3 w-20" />
          <Skeleton className="h-7 w-44" />
          <Skeleton className="h-4 w-64" />
        </div>
        <Skeleton className="h-9 w-36 rounded-lg" />
      </div>
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {[1, 2, 3, 4].map((tile) => (
          <div key={tile} className="space-y-3 rounded-xl border border-line bg-surface p-4">
            <Skeleton className="h-3 w-20" />
            <Skeleton className="h-7 w-16" />
            <Skeleton className="h-3 w-32" />
          </div>
        ))}
      </div>
      <div className="grid gap-6 xl:grid-cols-4">
        <div className="overflow-hidden rounded-xl border border-line bg-surface xl:col-span-3">
          <div className="space-y-2 border-b border-line px-5 py-4">
            <Skeleton className="h-4 w-28" />
            <Skeleton className="h-3 w-40" />
          </div>
          <div className="border-b border-line px-5 py-3">
            <Skeleton className="h-8 w-full max-w-xl rounded-lg" />
          </div>
          {[1, 2, 3, 4, 5].map((row) => (
            <div
              key={row}
              className="grid grid-cols-5 gap-4 border-b border-line px-5 py-4 last:border-0"
            >
              {[1, 2, 3, 4, 5].map((cell) => (
                <Skeleton key={cell} className="h-4" />
              ))}
            </div>
          ))}
        </div>
        <div className="space-y-6">
          <Skeleton className="h-40 rounded-xl" />
          <Skeleton className="h-44 rounded-xl" />
        </div>
      </div>
    </div>
  );
}
