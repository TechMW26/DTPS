'use client';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { cn } from '@/lib/utils';
import { TrendingUp, TrendingDown, Minus } from 'lucide-react';

interface ProgressData {
  label: string;
  current: number;
  target: number;
  unit: string;
  change?: number;
}

interface ProgressChartProps {
  title: string;
  data: ProgressData[];
  showTrend?: boolean;
  className?: string;
}

export function ClientProgressChart({
  title,
  data,
  showTrend = true,
  className,
}: ProgressChartProps) {
  const getProgressPercentage = (current: number, target: number) => {
    return Math.min(Math.round((current / target) * 100), 100);
  };

  const getTrendIcon = (change?: number) => {
    if (!change) return <Minus className="h-3 w-3 text-gray-400" />;
    if (change > 0) return <TrendingUp className="h-3 w-3 text-green-500" />;
    return <TrendingDown className="h-3 w-3 text-red-500" />;
  };

  const getProgressColor = (percentage: number) => {
    if (percentage >= 80) return 'bg-green-500';
    if (percentage >= 50) return 'bg-yellow-500';
    return 'bg-red-500';
  };

  return (
    <Card className={cn("border-0 shadow-sm", className)}>
      <CardHeader className="p-4 pb-2">
        <CardTitle className="text-sm font-semibold">{title}</CardTitle>
      </CardHeader>
      <CardContent className="p-4 pt-2">
        <div className="space-y-4">
          {data.map((item, index) => {
            const percentage = getProgressPercentage(item.current, item.target);
            return (
              <div key={index} className="space-y-1">
                <div className="flex items-center justify-between text-sm">
                  <span className="text-gray-600">{item.label}</span>
                  <div className="flex items-center gap-2">
                    <span className="font-medium text-gray-900">
                      {item.current} / {item.target} {item.unit}
                    </span>
                    {showTrend && getTrendIcon(item.change)}
                  </div>
                </div>
                <div className="relative h-2 bg-gray-100 rounded-full overflow-hidden">
                  <div
                    className={cn(
                      "absolute left-0 top-0 h-full rounded-full transition-all duration-500",
                      getProgressColor(percentage)
                    )}
                    style={{ width: `${percentage}%` }}
                  />
                </div>
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}

interface CircularProgressProps {
  value: number;
  maxValue: number;
  label: string;
  unit?: string;
  size?: 'sm' | 'md' | 'lg';
  color?: 'green' | 'blue' | 'orange' | 'purple';
  className?: string;
}

export function ClientCircularProgress({
  value,
  maxValue,
  label,
  unit = '',
  size = 'md',
  color = 'green',
  className,
}: CircularProgressProps) {
  const percentage = Math.min(Math.round((value / maxValue) * 100), 100);
  
  const sizeClasses = {
    sm: 'h-20 w-20',
    md: 'h-28 w-28',
    lg: 'h-36 w-36',
  };

  const strokeWidth = size === 'sm' ? 6 : size === 'md' ? 8 : 10;
  const radius = size === 'sm' ? 32 : size === 'md' ? 48 : 64;
  const circumference = 2 * Math.PI * radius;
  const strokeDashoffset = circumference - (percentage / 100) * circumference;

  const colorClasses = {
    green: 'stroke-green-500',
    blue: 'stroke-blue-500',
    orange: 'stroke-orange-500',
    purple: 'stroke-purple-500',
  };

  return (
    <div className={cn("flex flex-col items-center", className)}>
      <div className={cn("relative", sizeClasses[size])}>
        <svg className="transform -rotate-90 w-full h-full">
          {/* Background circle */}
          <circle
            cx="50%"
            cy="50%"
            r={radius}
            fill="transparent"
            stroke="currentColor"
            strokeWidth={strokeWidth}
            className="text-gray-100"
          />
          {/* Progress circle */}
          <circle
            cx="50%"
            cy="50%"
            r={radius}
            fill="transparent"
            strokeWidth={strokeWidth}
            strokeLinecap="round"
            className={colorClasses[color]}
            style={{
              strokeDasharray: circumference,
              strokeDashoffset: strokeDashoffset,
              transition: 'stroke-dashoffset 0.5s ease',
            }}
          />
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className="text-lg font-bold text-gray-900">
            {value}{unit}
          </span>
          <span className="text-xs text-gray-500">
            of {maxValue}
          </span>
        </div>
      </div>
      <span className="mt-2 text-xs font-medium text-gray-600">{label}</span>
    </div>
  );
}

export default ClientProgressChart;
