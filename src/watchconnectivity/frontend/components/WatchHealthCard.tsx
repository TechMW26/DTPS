'use client';

import { 
  Footprints, 
  Heart, 
  Moon, 
  Wind, 
  Activity,
  Flame,
  Brain,
  Droplets
} from 'lucide-react';

interface WatchHealthCardProps {
  watchMetricType: 'steps' | 'heartrate' | 'sleep' | 'oxygen' | 'stress' | 'breathing' | 'activity' | 'calories';
  watchValue: number | string;
  watchUnit?: string;
  watchGoal?: number;
  watchSubtext?: string;
  watchTrend?: 'up' | 'down' | 'stable';
  onClick?: () => void;
}

const WATCH_METRIC_CONFIG = {
  steps: {
    icon: Footprints,
    label: 'Steps',
    color: '#3AB1A0',
    bgColor: '#3AB1A0/10',
    emoji: '👣',
  },
  heartrate: {
    icon: Heart,
    label: 'Heart Rate',
    color: '#E06A26',
    bgColor: '#E06A26/10',
    emoji: '❤️',
  },
  sleep: {
    icon: Moon,
    label: 'Sleep',
    color: '#6366F1',
    bgColor: '#6366F1/10',
    emoji: '😴',
  },
  oxygen: {
    icon: Droplets,
    label: 'SpO2',
    color: '#0EA5E9',
    bgColor: '#0EA5E9/10',
    emoji: '🫁',
  },
  stress: {
    icon: Brain,
    label: 'Stress',
    color: '#F59E0B',
    bgColor: '#F59E0B/10',
    emoji: '🧠',
  },
  breathing: {
    icon: Wind,
    label: 'Breathing',
    color: '#10B981',
    bgColor: '#10B981/10',
    emoji: '🌬️',
  },
  activity: {
    icon: Activity,
    label: 'Activity',
    color: '#8B5CF6',
    bgColor: '#8B5CF6/10',
    emoji: '🏃',
  },
  calories: {
    icon: Flame,
    label: 'Calories',
    color: '#EF4444',
    bgColor: '#EF4444/10',
    emoji: '🔥',
  },
};

export function WatchHealthCard({
  watchMetricType,
  watchValue,
  watchUnit,
  watchGoal,
  watchSubtext,
  watchTrend,
  onClick,
}: WatchHealthCardProps) {
  const config = WATCH_METRIC_CONFIG[watchMetricType];
  const Icon = config.icon;
  
  const progressPercent = watchGoal 
    ? Math.min((Number(watchValue) / watchGoal) * 100, 100) 
    : null;

  return (
    <div 
      className={`p-4 bg-white rounded-2xl shadow-sm ${onClick ? 'cursor-pointer hover:shadow-md' : ''} transition-all`}
      onClick={onClick}
    >
      <div className="flex items-start justify-between mb-2">
        <div 
          className="w-10 h-10 rounded-xl flex items-center justify-center"
          style={{ backgroundColor: `${config.color}15` }}
        >
          <span className="text-xl">{config.emoji}</span>
        </div>
        {watchTrend && (
          <span className={`text-xs font-medium ${
            watchTrend === 'up' ? 'text-green-500' : 
            watchTrend === 'down' ? 'text-red-500' : 
            'text-gray-400'
          }`}>
            {watchTrend === 'up' ? '↑' : watchTrend === 'down' ? '↓' : '→'}
          </span>
        )}
      </div>
      
      <p className="text-xs text-gray-500 mb-1">{config.label}</p>
      
      <div className="flex items-baseline gap-1">
        <span className="text-2xl font-bold" style={{ color: config.color }}>
          {watchValue}
        </span>
        {watchUnit && (
          <span className="text-sm text-gray-400">{watchUnit}</span>
        )}
      </div>
      
      {watchSubtext && (
        <p className="text-xs text-gray-400 mt-1">{watchSubtext}</p>
      )}
      
      {progressPercent !== null && (
        <div className="mt-2">
          <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
            <div 
              className="h-full rounded-full transition-all"
              style={{ 
                width: `${progressPercent}%`,
                backgroundColor: config.color,
              }}
            />
          </div>
          <p className="text-xs text-gray-400 mt-1">
            {Math.round(progressPercent)}% of {watchGoal?.toLocaleString()} goal
          </p>
        </div>
      )}
    </div>
  );
}

export default WatchHealthCard;
