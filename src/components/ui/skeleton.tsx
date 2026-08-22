import type { HTMLAttributes } from 'react';
import { cn } from '@/lib/utils';

type SkeletonProps = HTMLAttributes<HTMLDivElement>;

/**
 * A layout-preserving placeholder. Keep its dimensions aligned with the final
 * content so loading never causes the surrounding interface to jump.
 */
export function Skeleton({ className, ...props }: SkeletonProps) {
  return (
    <div
      aria-hidden="true"
      className={cn(
        'animate-pulse rounded-md bg-gray-200/85 dark:bg-gray-800 motion-reduce:animate-none',
        className,
      )}
      {...props}
    />
  );
}

export function SkeletonText({
  lines = 2,
  className,
}: {
  lines?: number;
  className?: string;
}) {
  return (
    <div className={cn('space-y-2', className)} aria-hidden="true">
      {Array.from({ length: lines }, (_, index) => (
        <Skeleton
          key={index}
          className={cn('h-3.5', index === lines - 1 ? 'w-2/3' : 'w-full')}
        />
      ))}
    </div>
  );
}

export function StatCardSkeleton({ className }: { className?: string }) {
  return (
    <div
      className={cn(
        'min-h-32 rounded-xl border border-gray-200 bg-white p-5 shadow-sm dark:border-gray-800 dark:bg-gray-900',
        className,
      )}
      aria-hidden="true"
    >
      <div className="flex items-center justify-between gap-4">
        <Skeleton className="h-4 w-24" />
        <Skeleton className="h-8 w-8 rounded-lg" />
      </div>
      <Skeleton className="mt-4 h-8 w-20" />
      <Skeleton className="mt-3 h-3 w-28" />
    </div>
  );
}

export function ListSkeleton({
  rows = 5,
  className,
  rowClassName,
}: {
  rows?: number;
  className?: string;
  rowClassName?: string;
}) {
  return (
    <div className={cn('space-y-3', className)} aria-hidden="true">
      {Array.from({ length: rows }, (_, index) => (
        <div
          key={index}
          className={cn(
            'flex min-h-16 items-center gap-3 rounded-xl border border-gray-100 bg-white p-3 dark:border-gray-800 dark:bg-gray-900',
            rowClassName,
          )}
        >
          <Skeleton className="h-10 w-10 shrink-0 rounded-full" />
          <div className="min-w-0 flex-1 space-y-2">
            <Skeleton className="h-4 w-2/5" />
            <Skeleton className="h-3 w-3/4" />
          </div>
          <Skeleton className="h-6 w-16 rounded-full" />
        </div>
      ))}
    </div>
  );
}

export function CardGridSkeleton({
  cards = 6,
  className,
}: {
  cards?: number;
  className?: string;
}) {
  return (
    <div className={cn('grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3', className)} aria-hidden="true">
      {Array.from({ length: cards }, (_, index) => (
        <div
          key={index}
          className="min-h-64 overflow-hidden rounded-2xl border border-gray-100 bg-white shadow-sm dark:border-gray-800 dark:bg-gray-900"
        >
          <Skeleton className="h-36 w-full rounded-none" />
          <div className="space-y-3 p-4">
            <Skeleton className="h-5 w-3/4" />
            <SkeletonText lines={2} />
            <div className="flex gap-2 pt-2">
              <Skeleton className="h-7 w-20 rounded-full" />
              <Skeleton className="h-7 w-16 rounded-full" />
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

export function TableSkeleton({
  rows = 7,
  columns = 5,
  className,
}: {
  rows?: number;
  columns?: number;
  className?: string;
}) {
  return (
    <div
      className={cn('overflow-hidden rounded-xl border border-gray-200 bg-white dark:border-gray-800 dark:bg-gray-900', className)}
      aria-hidden="true"
    >
      <div
        className="grid gap-4 border-b border-gray-200 bg-gray-50 p-4 dark:border-gray-800 dark:bg-gray-900"
        style={{ gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))` }}
      >
        {Array.from({ length: columns }, (_, index) => (
          <Skeleton key={index} className="h-4 w-3/4" />
        ))}
      </div>
      {Array.from({ length: rows }, (_, row) => (
        <div
          key={row}
          className="grid min-h-16 items-center gap-4 border-b border-gray-100 p-4 last:border-b-0 dark:border-gray-800"
          style={{ gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))` }}
        >
          {Array.from({ length: columns }, (_, column) => (
            <Skeleton key={column} className={cn('h-4', column === 0 ? 'w-4/5' : 'w-2/3')} />
          ))}
        </div>
      ))}
    </div>
  );
}

export function DashboardContentSkeleton({
  statCards = 4,
  sections = 4,
}: {
  statCards?: number;
  sections?: number;
}) {
  return (
    <div className="space-y-4 p-3 sm:space-y-6 sm:p-6" role="status" aria-label="Loading dashboard">
      <span className="sr-only">Loading dashboard</span>
      <div className="space-y-2">
        <Skeleton className="h-8 w-56 sm:h-9" />
        <Skeleton className="h-4 w-72 max-w-full" />
      </div>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4 sm:gap-6">
        {Array.from({ length: statCards }, (_, index) => (
          <StatCardSkeleton key={index} />
        ))}
      </div>
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2 sm:gap-6">
        {Array.from({ length: sections }, (_, index) => (
          <div
            key={index}
            className="min-h-80 rounded-xl border border-gray-200 bg-white p-5 shadow-sm dark:border-gray-800 dark:bg-gray-900"
            aria-hidden="true"
          >
            <Skeleton className="h-6 w-40" />
            <Skeleton className="mt-2 h-3 w-56 max-w-full" />
            <ListSkeleton rows={3} className="mt-5" />
          </div>
        ))}
      </div>
    </div>
  );
}

export function StaffAppSkeleton() {
  return (
    <div className="flex h-screen overflow-hidden bg-gray-50 dark:bg-gray-950" role="status" aria-label="Loading application">
      <span className="sr-only">Loading application</span>
      <aside className="hidden h-screen w-64 shrink-0 border-r border-gray-200 bg-white p-5 dark:border-gray-800 dark:bg-gray-900 lg:block">
        <Skeleton className="h-10 w-28" />
        <div className="mt-10 space-y-3">
          {Array.from({ length: 9 }, (_, index) => (
            <Skeleton key={index} className="h-10 w-full rounded-lg" />
          ))}
        </div>
      </aside>
      <div className="min-w-0 flex-1">
        <header className="flex h-16 items-center justify-between border-b border-gray-200 bg-white px-4 dark:border-gray-800 dark:bg-gray-900 sm:px-6">
          <Skeleton className="h-8 w-36" />
          <div className="flex items-center gap-3">
            <Skeleton className="h-9 w-9 rounded-full" />
            <Skeleton className="h-9 w-9 rounded-full" />
          </div>
        </header>
        <DashboardContentSkeleton />
      </div>
    </div>
  );
}

export function ClientPageSkeleton({
  variant = 'list',
  showHeader = true,
  embedded,
}: {
  variant?: 'home' | 'list' | 'grid' | 'plan' | 'form';
  showHeader?: boolean;
  embedded?: boolean;
}) {
  const isEmbedded = embedded ?? !showHeader;

  return (
    <div
      className={cn(
        'w-full bg-gray-50 dark:bg-gray-950',
        isEmbedded
          ? 'min-h-[calc(100dvh-var(--client-bottom-nav-clearance))] pb-6'
          : 'min-h-dvh pb-28',
      )}
      role="status"
      aria-label="Loading page"
    >
      <span className="sr-only">Loading page</span>
      {showHeader && (
        <header className="flex h-16 items-center justify-between border-b border-gray-100 bg-white px-4 dark:border-gray-800 dark:bg-gray-900">
          <Skeleton className="h-10 w-10 rounded-full" />
          <Skeleton className="h-6 w-32" />
          <Skeleton className="h-10 w-10 rounded-full" />
        </header>
      )}
      <div className="mx-auto w-full max-w-5xl space-y-5 p-4 sm:p-6">
        {variant === 'home' && (
          <>
            <div className="flex items-center justify-between">
              <div className="space-y-2">
                <Skeleton className="h-3 w-24" />
                <Skeleton className="h-8 w-44" />
              </div>
              <Skeleton className="h-12 w-12 rounded-full" />
            </div>
            <Skeleton className="h-48 w-full rounded-2xl" />
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              {Array.from({ length: 4 }, (_, index) => <StatCardSkeleton key={index} className="min-h-28" />)}
            </div>
            <CardGridSkeleton cards={3} />
          </>
        )}
        {variant === 'list' && <ListSkeleton rows={7} />}
        {variant === 'grid' && <CardGridSkeleton cards={6} />}
        {variant === 'plan' && (
          <>
            <div className="flex gap-3 overflow-hidden">
              {Array.from({ length: 7 }, (_, index) => <Skeleton key={index} className="h-16 w-14 shrink-0 rounded-xl" />)}
            </div>
            <Skeleton className="h-36 w-full rounded-2xl" />
            <ListSkeleton rows={5} rowClassName="min-h-24" />
          </>
        )}
        {variant === 'form' && (
          <div className="space-y-5 rounded-2xl border border-gray-100 bg-white p-5 dark:border-gray-800 dark:bg-gray-900">
            <Skeleton className="h-7 w-48" />
            {Array.from({ length: 6 }, (_, index) => (
              <div key={index} className="space-y-2">
                <Skeleton className="h-4 w-28" />
                <Skeleton className="h-12 w-full rounded-xl" />
              </div>
            ))}
            <Skeleton className="h-12 w-full rounded-xl" />
          </div>
        )}
      </div>
    </div>
  );
}
