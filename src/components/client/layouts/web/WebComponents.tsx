'use client';

import { ReactNode } from 'react';
import { cn } from '@/lib/utils';

/**
 * WebContainer - Container with max-width for desktop
 */
interface WebContainerProps {
  children: ReactNode;
  size?: 'sm' | 'md' | 'lg' | 'xl' | 'full';
  className?: string;
}

export function WebContainer({ children, size = 'lg', className }: WebContainerProps) {
  const sizeClass = {
    sm: 'max-w-3xl',
    md: 'max-w-5xl',
    lg: 'max-w-6xl',
    xl: 'max-w-7xl',
    full: 'max-w-full',
  };

  return (
    <div className={cn('mx-auto w-full px-6', sizeClass[size], className)}>
      {children}
    </div>
  );
}

/**
 * WebPageHeader - Page header for desktop views
 */
interface WebPageHeaderProps {
  title: string;
  subtitle?: string;
  breadcrumbs?: { label: string; href?: string }[];
  action?: ReactNode;
  className?: string;
}

export function WebPageHeader({ 
  title, 
  subtitle, 
  breadcrumbs, 
  action,
  className 
}: WebPageHeaderProps) {
  return (
    <div className={cn('mb-8', className)}>
      {/* Breadcrumbs */}
      {breadcrumbs && breadcrumbs.length > 0 && (
        <nav className="flex items-center gap-2 text-sm text-gray-500 mb-2">
          {breadcrumbs.map((crumb, index) => (
            <span key={index} className="flex items-center gap-2">
              {index > 0 && <span>/</span>}
              {crumb.href ? (
                <a href={crumb.href} className="hover:text-gray-700">
                  {crumb.label}
                </a>
              ) : (
                <span className="text-gray-900">{crumb.label}</span>
              )}
            </span>
          ))}
        </nav>
      )}

      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">{title}</h1>
          {subtitle && (
            <p className="text-gray-500 mt-1">{subtitle}</p>
          )}
        </div>
        {action}
      </div>
    </div>
  );
}

/**
 * WebGrid - Multi-column grid for desktop
 */
interface WebGridProps {
  children: ReactNode;
  cols?: 1 | 2 | 3 | 4 | 5 | 6;
  gap?: 'sm' | 'md' | 'lg';
  className?: string;
}

export function WebGrid({ children, cols = 3, gap = 'md', className }: WebGridProps) {
  const colsClass = {
    1: 'grid-cols-1',
    2: 'grid-cols-2',
    3: 'grid-cols-3',
    4: 'grid-cols-4',
    5: 'grid-cols-5',
    6: 'grid-cols-6',
  };

  const gapClass = {
    sm: 'gap-4',
    md: 'gap-6',
    lg: 'gap-8',
  };

  return (
    <div className={cn('grid', colsClass[cols], gapClass[gap], className)}>
      {children}
    </div>
  );
}

/**
 * WebSidebar - Sidebar for desktop layouts
 */
interface WebSidebarProps {
  children: ReactNode;
  width?: 'sm' | 'md' | 'lg';
  className?: string;
}

export function WebSidebar({ children, width = 'md', className }: WebSidebarProps) {
  const widthClass = {
    sm: 'w-64',
    md: 'w-80',
    lg: 'w-96',
  };

  return (
    <aside className={cn(
      'shrink-0 bg-white border-r border-gray-200',
      widthClass[width],
      className
    )}>
      {children}
    </aside>
  );
}

/**
 * WebMainContent - Main content area for desktop
 */
interface WebMainContentProps {
  children: ReactNode;
  className?: string;
}

export function WebMainContent({ children, className }: WebMainContentProps) {
  return (
    <main className={cn('flex-1 min-w-0', className)}>
      {children}
    </main>
  );
}

/**
 * WebCard - Card component for desktop
 */
interface WebCardProps {
  children: ReactNode;
  title?: string;
  subtitle?: string;
  action?: ReactNode;
  className?: string;
}

export function WebCard({ children, title, subtitle, action, className }: WebCardProps) {
  return (
    <div className={cn(
      'bg-white rounded-xl shadow-sm border border-gray-100',
      className
    )}>
      {(title || action) && (
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
          <div>
            {title && <h3 className="font-semibold text-gray-900">{title}</h3>}
            {subtitle && <p className="text-sm text-gray-500">{subtitle}</p>}
          </div>
          {action}
        </div>
      )}
      <div className="p-6">
        {children}
      </div>
    </div>
  );
}

/**
 * WebTwoColumn - Two column layout for desktop
 */
interface WebTwoColumnProps {
  children: ReactNode;
  sidebar: ReactNode;
  sidebarPosition?: 'left' | 'right';
  sidebarWidth?: 'sm' | 'md' | 'lg';
  className?: string;
}

export function WebTwoColumn({ 
  children, 
  sidebar, 
  sidebarPosition = 'right',
  sidebarWidth = 'md',
  className 
}: WebTwoColumnProps) {
  const widthClass = {
    sm: 'w-64',
    md: 'w-80',
    lg: 'w-96',
  };

  return (
    <div className={cn('flex gap-6', className)}>
      {sidebarPosition === 'left' && (
        <div className={cn('shrink-0', widthClass[sidebarWidth])}>
          {sidebar}
        </div>
      )}
      <div className="flex-1 min-w-0">
        {children}
      </div>
      {sidebarPosition === 'right' && (
        <div className={cn('shrink-0', widthClass[sidebarWidth])}>
          {sidebar}
        </div>
      )}
    </div>
  );
}

/**
 * WebStatsCard - Stats card for desktop dashboards
 */
interface WebStatsCardProps {
  title: string;
  value: string | number;
  change?: { value: number; isPositive: boolean };
  icon?: ReactNode;
  className?: string;
}

export function WebStatsCard({ title, value, change, icon, className }: WebStatsCardProps) {
  return (
    <div className={cn(
      'bg-white rounded-xl shadow-sm border border-gray-100 p-6',
      className
    )}>
      <div className="flex items-start justify-between">
        <div>
          <p className="text-sm text-gray-500">{title}</p>
          <p className="text-2xl font-bold text-gray-900 mt-1">{value}</p>
          {change && (
            <p className={cn(
              'text-sm mt-1',
              change.isPositive ? 'text-green-600' : 'text-red-600'
            )}>
              {change.isPositive ? '↑' : '↓'} {Math.abs(change.value)}%
            </p>
          )}
        </div>
        {icon && (
          <div className="h-12 w-12 rounded-xl bg-gray-100 flex items-center justify-center">
            {icon}
          </div>
        )}
      </div>
    </div>
  );
}

/**
 * WebTable - Table component for desktop
 */
interface WebTableProps {
  children: ReactNode;
  className?: string;
}

export function WebTable({ children, className }: WebTableProps) {
  return (
    <div className={cn('overflow-x-auto', className)}>
      <table className="w-full">
        {children}
      </table>
    </div>
  );
}

export default WebContainer;
