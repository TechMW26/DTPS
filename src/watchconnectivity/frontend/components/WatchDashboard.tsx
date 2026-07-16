'use client';

import { WatchHealthData } from '../hooks/useWatchConnection';
import WatchHealthCard from './WatchHealthCard';

interface WatchDashboardProps {
  watchHealthData: WatchHealthData | null;
  watchLoading?: boolean;
  onWatchCardClick?: (metric: string) => void;
}

export function WatchDashboard({
  watchHealthData,
  watchLoading = false,
  onWatchCardClick,
}: WatchDashboardProps) {
  if (watchLoading) {
    return (
      <div className="grid grid-cols-2 gap-3 animate-pulse">
        {[1, 2, 3, 4, 5, 6, 7, 8].map((i) => (
          <div key={i} className="h-32 bg-gray-100 rounded-2xl" />
        ))}
      </div>
    );
  }

  if (!watchHealthData) {
    return (
      <div className="text-center py-8 text-gray-500">
        <p className="text-4xl mb-3">📊</p>
        <p className="text-sm">No health data available</p>
        <p className="text-xs text-gray-400 mt-1">Connect your watch to see data</p>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-2 gap-3">
      {/* Steps */}
      <WatchHealthCard
        watchMetricType="steps"
        watchValue={watchHealthData.watchSteps?.count?.toLocaleString() || '0'}
        watchUnit="steps"
        watchGoal={watchHealthData.watchSteps?.goal || 10000}
        watchSubtext={watchHealthData.watchSteps?.distance 
          ? `${(watchHealthData.watchSteps.distance / 1000).toFixed(1)} km`
          : undefined
        }
        onClick={() => onWatchCardClick?.('steps')}
      />

      {/* Heart Rate */}
      <WatchHealthCard
        watchMetricType="heartrate"
        watchValue={watchHealthData.watchHeartRate?.current || '--'}
        watchUnit="bpm"
        watchSubtext={watchHealthData.watchHeartRate?.average 
          ? `Avg: ${watchHealthData.watchHeartRate.average} bpm`
          : undefined
        }
        onClick={() => onWatchCardClick?.('heartrate')}
      />

      {/* Sleep */}
      <WatchHealthCard
        watchMetricType="sleep"
        watchValue={watchHealthData.watchSleep?.totalHours?.toFixed(1) || '0'}
        watchUnit="hours"
        watchSubtext={watchHealthData.watchSleep?.sleepQuality 
          ? `Quality: ${watchHealthData.watchSleep.sleepQuality}`
          : undefined
        }
        onClick={() => onWatchCardClick?.('sleep')}
      />

      {/* SpO2 */}
      <WatchHealthCard
        watchMetricType="oxygen"
        watchValue={watchHealthData.watchOxygen?.current || '--'}
        watchUnit="%"
        watchSubtext={`Range: ${watchHealthData.watchOxygen?.min || '--'}-${watchHealthData.watchOxygen?.max || '--'}%`}
        onClick={() => onWatchCardClick?.('oxygen')}
      />

      {/* Stress */}
      <WatchHealthCard
        watchMetricType="stress"
        watchValue={watchHealthData.watchStress?.current || 0}
        watchUnit=""
        watchSubtext={watchHealthData.watchStress?.level 
          ? `Level: ${watchHealthData.watchStress.level.replace('_', ' ')}`
          : undefined
        }
        onClick={() => onWatchCardClick?.('stress')}
      />

      {/* Breathing */}
      <WatchHealthCard
        watchMetricType="breathing"
        watchValue={watchHealthData.watchBreathing?.current || '--'}
        watchUnit="br/min"
        watchSubtext={watchHealthData.watchBreathing?.average 
          ? `Avg: ${watchHealthData.watchBreathing.average} br/min`
          : undefined
        }
        onClick={() => onWatchCardClick?.('breathing')}
      />

      {/* Activity */}
      <WatchHealthCard
        watchMetricType="activity"
        watchValue={watchHealthData.watchActivity?.activeMinutes || 0}
        watchUnit="min"
        watchGoal={60}
        watchSubtext={`${watchHealthData.watchActivity?.standingHours || 0} standing hours`}
        onClick={() => onWatchCardClick?.('activity')}
      />

      {/* Calories */}
      <WatchHealthCard
        watchMetricType="calories"
        watchValue={watchHealthData.watchCalories?.total?.toLocaleString() || '0'}
        watchUnit="kcal"
        watchGoal={watchHealthData.watchCalories?.goal || 2000}
        watchSubtext={`Active: ${watchHealthData.watchCalories?.active || 0} kcal`}
        onClick={() => onWatchCardClick?.('calories')}
      />
    </div>
  );
}

export default WatchDashboard;
