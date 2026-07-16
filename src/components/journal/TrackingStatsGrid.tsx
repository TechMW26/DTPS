'use client';

import { Card, CardContent } from '@/components/ui/card';

interface CircularProgressProps {
  percentage: number;
  color: string;
  size?: number;
  strokeWidth?: number;
}

function CircularProgress({ percentage, color, size = 60, strokeWidth = 6 }: CircularProgressProps) {
  const radius = (size - strokeWidth) / 2;
  const circumference = radius * 2 * Math.PI;
  const offset = circumference - (percentage / 100) * circumference;
  
  return (
    <div className="relative" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="transform -rotate-90">
        {/* Background circle */}
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          stroke="#e5e7eb"
          strokeWidth={strokeWidth}
          fill="none"
        />
        {/* Progress circle */}
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          stroke={color}
          strokeWidth={strokeWidth}
          fill="none"
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          className="transition-all duration-500"
        />
      </svg>
      <div className="absolute inset-0 flex items-center justify-center">
        <span className="text-xs font-semibold text-gray-700">{percentage}%</span>
      </div>
    </div>
  );
}

interface TrackingStatCardProps {
  title: string;
  value: string;
  percentage: number;
  color: string;
}

interface TrackingStatsGridProps {
  stats: TrackingStatCardProps[];
}

export default function TrackingStatsGrid({ stats }: TrackingStatsGridProps) {
  return (
    <div className="grid grid-cols-3 gap-4">
      {stats.map((stat, index) => (
        <Card key={index} className="border-0 shadow-sm">
          <CardContent className="p-4 flex items-center gap-3">
            <CircularProgress 
              percentage={stat.percentage} 
              color={stat.color}
            />
            <div>
              <p className="text-sm font-medium" style={{ color: stat.color }}>
                {stat.title}
              </p>
              <p className="text-sm text-gray-600">{stat.value}</p>
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
