'use client';

import { Card, CardContent } from '@/components/ui/card';
import { LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils';

interface StatCardProps {
  title: string;
  value: string | number;
  subtitle?: string;
  icon: LucideIcon;
  trend?: {
    value: number;
    isPositive: boolean;
  };
  color?: 'green' | 'blue' | 'purple' | 'orange' | 'red' | 'teal';
  className?: string;
}

const colorClasses = {
  green: {
    bg: 'bg-green-50',
    icon: 'bg-green-100 text-green-600',
    text: 'text-green-600',
  },
  blue: {
    bg: 'bg-blue-50',
    icon: 'bg-blue-100 text-blue-600',
    text: 'text-blue-600',
  },
  purple: {
    bg: 'bg-purple-50',
    icon: 'bg-purple-100 text-purple-600',
    text: 'text-purple-600',
  },
  orange: {
    bg: 'bg-orange-50',
    icon: 'bg-orange-100 text-orange-600',
    text: 'text-orange-600',
  },
  red: {
    bg: 'bg-red-50',
    icon: 'bg-red-100 text-red-600',
    text: 'text-red-600',
  },
  teal: {
    bg: 'bg-teal-50',
    icon: 'bg-teal-100 text-teal-600',
    text: 'text-teal-600',
  },
};

export function ClientStatCard({ 
  title, 
  value, 
  subtitle, 
  icon: Icon, 
  trend,
  color = 'green',
  className 
}: StatCardProps) {
  const colors = colorClasses[color];

  return (
    <Card className={cn("border-0 shadow-sm", className)}>
      <CardContent className="p-4">
        <div className="flex items-start justify-between">
          <div className="flex-1">
            <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">
              {title}
            </p>
            <p className="text-2xl font-bold text-gray-900 mt-1">
              {value}
            </p>
            {subtitle && (
              <p className="text-xs text-gray-500 mt-1">{subtitle}</p>
            )}
            {trend && (
              <p className={cn(
                "text-xs font-medium mt-1",
                trend.isPositive ? "text-green-600" : "text-red-600"
              )}>
                {trend.isPositive ? '↑' : '↓'} {Math.abs(trend.value)}%
              </p>
            )}
          </div>
          <div className={cn("h-10 w-10 rounded-xl flex items-center justify-center", colors.icon)}>
            <Icon className="h-5 w-5" />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

interface StatsGridProps {
  children: React.ReactNode;
  className?: string;
}

export function ClientStatsGrid({ children, className }: StatsGridProps) {
  return (
    <div className={cn(
      "grid grid-cols-2 gap-3 sm:grid-cols-2 lg:grid-cols-4",
      className
    )}>
      {children}
    </div>
  );
}

export default ClientStatCard;
