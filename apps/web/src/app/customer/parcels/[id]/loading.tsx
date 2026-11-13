import { Skeleton } from '@/components/ui';

export default function ParcelDetailsLoading() {
  return (
    <div className="space-y-6" aria-label="Loading delivery details" aria-busy="true">
      <div className="space-y-2">
        <Skeleton className="h-3 w-40" />
        <Skeleton className="h-7 w-56" />
        <Skeleton className="h-4 w-72" />
      </div>
      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <Skeleton className="h-56 rounded-xl" />
          <Skeleton className="h-72 rounded-xl" />
        </div>
        <div className="space-y-6">
          <Skeleton className="h-48 rounded-xl" />
          <Skeleton className="h-28 rounded-xl" />
        </div>
      </div>
    </div>
  );
}
