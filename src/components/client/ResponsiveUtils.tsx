'use client';

import { ReactNode } from 'react';
import { cn } from '@/lib/utils';

/**
 * Responsive Container - Provides proper padding and max-width for content
 */
interface ContainerProps {
  children: ReactNode;
  className?: string;
  size?: 'sm' | 'md' | 'lg' | 'xl' | 'full';
}

export function Container({ children, className, size = 'lg' }: ContainerProps) {
  const maxWidthClasses = {
    sm: 'max-w-2xl',
    md: 'max-w-4xl',
    lg: 'max-w-6xl',
    xl: 'max-w-7xl',
    full: 'max-w-full',
  };

  return (
    <div className={cn(
      'mx-auto w-full px-4 sm:px-6 lg:px-8',
      maxWidthClasses[size],
      className
    )}>
      {children}
    </div>
  );
}

/**
 * PageHeader - Consistent page headers with responsive layout
 */
interface PageHeaderProps {
  title: string;
  subtitle?: string;
  action?: ReactNode;
  backHref?: string;
  className?: string;
}

export function PageHeader({ title, subtitle, action, className }: PageHeaderProps) {
  return (
    <div className={cn(
      'flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-6',
      className
    )}>
      <div>
        <h1 className="text-xl sm:text-2xl lg:text-3xl font-bold text-gray-900">
          {title}
        </h1>
        {subtitle && (
          <p className="text-sm sm:text-base text-gray-500 mt-1">
            {subtitle}
          </p>
        )}
      </div>
      {action && (
        <div className="shrink-0">
          {action}
        </div>
      )}
    </div>
  );
}

/**
 * Section - Groups related content with consistent spacing
 */
interface SectionProps {
  children: ReactNode;
  title?: string;
  subtitle?: string;
  action?: ReactNode;
  className?: string;
}

export function Section({ children, title, subtitle, action, className }: SectionProps) {
  return (
    <section className={cn('mb-6 sm:mb-8', className)}>
      {(title || action) && (
        <div className="flex items-center justify-between mb-4">
          <div>
            {title && (
              <h2 className="text-base sm:text-lg font-semibold text-gray-900">
                {title}
              </h2>
            )}
            {subtitle && (
              <p className="text-xs sm:text-sm text-gray-500 mt-0.5">
                {subtitle}
              </p>
            )}
          </div>
          {action && (
            <div className="shrink-0">
              {action}
            </div>
          )}
        </div>
      )}
      {children}
    </section>
  );
}

/**
 * ResponsiveGrid - Responsive grid layout with configurable columns
 */
interface ResponsiveGridProps {
  children: ReactNode;
  cols?: {
    mobile?: number;
    sm?: number;
    md?: number;
    lg?: number;
    xl?: number;
  };
  gap?: 'sm' | 'md' | 'lg';
  className?: string;
}

export function ResponsiveGrid({ 
  children, 
  cols = { mobile: 1, sm: 2, md: 2, lg: 3, xl: 4 },
  gap = 'md',
  className 
}: ResponsiveGridProps) {
  const gapClasses = {
    sm: 'gap-2 sm:gap-3',
    md: 'gap-3 sm:gap-4',
    lg: 'gap-4 sm:gap-6',
  };

  // Generate column classes dynamically
  const colClasses = [
    `grid-cols-${cols.mobile || 1}`,
    cols.sm && `sm:grid-cols-${cols.sm}`,
    cols.md && `md:grid-cols-${cols.md}`,
    cols.lg && `lg:grid-cols-${cols.lg}`,
    cols.xl && `xl:grid-cols-${cols.xl}`,
  ].filter(Boolean).join(' ');

  return (
    <div className={cn(
      'grid',
      gapClasses[gap],
      colClasses,
      className
    )}>
      {children}
    </div>
  );
}

/**
 * MobileOnly - Only renders on mobile screens
 */
interface ConditionalRenderProps {
  children: ReactNode;
  className?: string;
}

export function MobileOnly({ children, className }: ConditionalRenderProps) {
  return (
    <div className={cn('block sm:hidden', className)}>
      {children}
    </div>
  );
}

/**
 * DesktopOnly - Only renders on desktop screens
 */
export function DesktopOnly({ children, className }: ConditionalRenderProps) {
  return (
    <div className={cn('hidden lg:block', className)}>
      {children}
    </div>
  );
}

/**
 * TabletAndUp - Renders on tablet and larger screens
 */
export function TabletAndUp({ children, className }: ConditionalRenderProps) {
  return (
    <div className={cn('hidden sm:block', className)}>
      {children}
    </div>
  );
}

/**
 * MobileAndTablet - Renders on mobile and tablet only
 */
export function MobileAndTablet({ children, className }: ConditionalRenderProps) {
  return (
    <div className={cn('block lg:hidden', className)}>
      {children}
    </div>
  );
}

/**
 * Stack - Vertical stack with consistent spacing
 */
interface StackProps {
  children: ReactNode;
  gap?: 'xs' | 'sm' | 'md' | 'lg' | 'xl';
  className?: string;
}

export function Stack({ children, gap = 'md', className }: StackProps) {
  const gapClasses = {
    xs: 'space-y-1',
    sm: 'space-y-2',
    md: 'space-y-4',
    lg: 'space-y-6',
    xl: 'space-y-8',
  };

  return (
    <div className={cn(gapClasses[gap], className)}>
      {children}
    </div>
  );
}

/**
 * Flex - Horizontal flex container with responsive direction
 */
interface FlexProps {
  children: ReactNode;
  direction?: 'row' | 'col' | 'responsive';
  align?: 'start' | 'center' | 'end' | 'stretch';
  justify?: 'start' | 'center' | 'end' | 'between' | 'around';
  gap?: 'xs' | 'sm' | 'md' | 'lg';
  wrap?: boolean;
  className?: string;
}

export function Flex({ 
  children, 
  direction = 'row',
  align = 'start',
  justify = 'start',
  gap = 'md',
  wrap = false,
  className 
}: FlexProps) {
  const directionClasses = {
    row: 'flex-row',
    col: 'flex-col',
    responsive: 'flex-col sm:flex-row',
  };

  const alignClasses = {
    start: 'items-start',
    center: 'items-center',
    end: 'items-end',
    stretch: 'items-stretch',
  };

  const justifyClasses = {
    start: 'justify-start',
    center: 'justify-center',
    end: 'justify-end',
    between: 'justify-between',
    around: 'justify-around',
  };

  const gapClasses = {
    xs: 'gap-1',
    sm: 'gap-2',
    md: 'gap-4',
    lg: 'gap-6',
  };

  return (
    <div className={cn(
      'flex',
      directionClasses[direction],
      alignClasses[align],
      justifyClasses[justify],
      gapClasses[gap],
      wrap && 'flex-wrap',
      className
    )}>
      {children}
    </div>
  );
}

export default Container;
