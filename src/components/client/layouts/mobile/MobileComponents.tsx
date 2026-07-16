'use client';

import { ReactNode } from 'react';
import { cn } from '@/lib/utils';
import Image from 'next/image';

/**
 * MobileContainer - Full-width container optimized for mobile
 */
interface MobileContainerProps {
  children: ReactNode;
  className?: string;
  noPadding?: boolean;
}

export function MobileContainer({ children, className, noPadding = false }: MobileContainerProps) {
  return (
    <div className={cn(
      'w-full',
      !noPadding && 'px-4',
      className
    )}>
      {children}
    </div>
  );
}

/**
 * MobileSection - Section with mobile-optimized spacing
 */
interface MobileSectionProps {
  children: ReactNode;
  title?: string;
  action?: ReactNode;
  className?: string;
}

export function MobileSection({ children, title, action, className }: MobileSectionProps) {
  return (
    <section className={cn('mb-6', className)}>
      {(title || action) && (
        <div className="flex items-center justify-between mb-3 px-4">
          {title && (
            <h2 className="text-base font-semibold text-gray-900">{title}</h2>
          )}
          {action}
        </div>
      )}
      {children}
    </section>
  );
}

/**
 * MobileCard - Compact card for mobile views
 */
interface MobileCardProps {
  children: ReactNode;
  className?: string;
  onClick?: () => void;
}

export function MobileCard({ children, className, onClick }: MobileCardProps) {
  return (
    <div
      className={cn(
        'bg-white rounded-xl p-4 shadow-sm',
        onClick && 'cursor-pointer active:scale-[0.98] transition-transform',
        className
      )}
      onClick={onClick}
    >
      {children}
    </div>
  );
}

/**
 * MobileList - List with dividers optimized for mobile
 */
interface MobileListProps {
  children: ReactNode;
  className?: string;
}

export function MobileList({ children, className }: MobileListProps) {
  return (
    <div className={cn('divide-y divide-gray-100', className)}>
      {children}
    </div>
  );
}

/**
 * MobileListItem - Individual list item
 */
interface MobileListItemProps {
  children: ReactNode;
  onClick?: () => void;
  className?: string;
}

export function MobileListItem({ children, onClick, className }: MobileListItemProps) {
  return (
    <div
      className={cn(
        'py-3',
        onClick && 'cursor-pointer active:bg-gray-50',
        className
      )}
      onClick={onClick}
    >
      {children}
    </div>
  );
}

/**
 * MobileGrid - Responsive grid for mobile
 */
interface MobileGridProps {
  children: ReactNode;
  cols?: 2 | 3 | 4;
  gap?: 'sm' | 'md' | 'lg';
  className?: string;
}

export function MobileGrid({ children, cols = 2, gap = 'md', className }: MobileGridProps) {
  const colsClass = {
    2: 'grid-cols-2',
    3: 'grid-cols-3',
    4: 'grid-cols-4',
  };

  const gapClass = {
    sm: 'gap-2',
    md: 'gap-3',
    lg: 'gap-4',
  };

  return (
    <div className={cn('grid', colsClass[cols], gapClass[gap], className)}>
      {children}
    </div>
  );
}

/**
 * MobileScrollArea - Horizontal scroll area for mobile
 */
interface MobileScrollAreaProps {
  children: ReactNode;
  className?: string;
}

export function MobileScrollArea({ children, className }: MobileScrollAreaProps) {
  return (
    <div className={cn(
      'overflow-x-auto scrollbar-hide -mx-4 px-4',
      className
    )}>
      <div className="flex gap-3 min-w-max">
        {children}
      </div>
    </div>
  );
}

/**
 * MobileActionButton - Floating action button for mobile
 */
interface MobileActionButtonProps {
  children: ReactNode;
  onClick?: () => void;
  position?: 'bottom-right' | 'bottom-center';
  className?: string;
}

export function MobileActionButton({
  children,
  onClick,
  position = 'bottom-right',
  className
}: MobileActionButtonProps) {
  const positionClass = {
    'bottom-right': 'right-4 bottom-20',
    'bottom-center': 'left-1/2 -translate-x-1/2 bottom-20',
  };

  return (
    <button
      onClick={onClick}
      className={cn(
        'fixed z-40 h-14 w-14 rounded-full bg-green-600 text-white shadow-lg flex items-center justify-center',
        'hover:bg-green-700 active:scale-95 transition-all',
        positionClass[position],
        className
      )}
    >
      {children}
    </button>
  );
}

/**
 * MobileEmptyState - Empty state for mobile
 */
interface MobileEmptyStateProps {
  icon: ReactNode;
  title: string;
  description?: string;
  action?: ReactNode;
  className?: string;
}

export function MobileEmptyState({
  icon,
  title,
  description,
  action,
  className
}: MobileEmptyStateProps) {
  return (
    <div className={cn('text-center py-12 px-4', className)}>
      <div className="h-16 w-16 rounded-full bg-gray-100 flex items-center justify-center mx-auto mb-4">
        {icon}
      </div>
      <h3 className="text-base font-semibold text-gray-900 mb-1">{title}</h3>
      {description && (
        <p className="text-sm text-gray-500 mb-4">{description}</p>
      )}
      {action}
    </div>
  );
}

/**
 * MobilePullToRefresh - Pull to refresh indicator
 */
interface MobilePullIndicatorProps {
  isRefreshing: boolean;
  className?: string;
}

export function MobilePullIndicator({ isRefreshing, className }: MobilePullIndicatorProps) {
  if (!isRefreshing) return null;

  return (
    <div className={cn(
      'flex items-center justify-center py-4',
      className
    )}>
      <Image
        src="/images/spoon-loader.gif"
        alt="Loading..."
        width={40}
        height={60}
        className="object-contain"
        style={{ height: 'auto' }}
        unoptimized
      />
    </div>
  );
}

export default MobileContainer;
