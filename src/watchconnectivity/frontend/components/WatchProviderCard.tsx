'use client';

import {
  Watch,
  Wifi,
  WifiOff,
  Loader2,
  Activity,
  HeartPulse,
  Heart,
  Navigation,
  Headphones,
  Timer,
  type LucideIcon,
} from 'lucide-react';

interface WatchProviderCardProps {
  watchProvider: {
    id: string;
    name: string;
    icon: LucideIcon;
    description: string;
    color: string;
    supported: string[];
  };
  watchIsConnected: boolean;
  onWatchConnect: () => void;
  onWatchDisconnect: () => void;
  watchConnecting?: boolean;
}

export function WatchProviderCard({
  watchProvider,
  watchIsConnected,
  onWatchConnect,
  onWatchDisconnect,
  watchConnecting = false,
}: WatchProviderCardProps) {
  const ProviderIcon = watchProvider.icon;
  return (
    <div className={`p-4 bg-white rounded-2xl shadow-sm border-2 transition-all ${
      watchIsConnected ? 'border-green-400 bg-green-50/50' : 'border-transparent hover:border-gray-200'
    }`}>
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div 
            className="w-12 h-12 rounded-xl flex items-center justify-center text-2xl"
            style={{ backgroundColor: `${watchProvider.color}20` }}
          >
            <ProviderIcon aria-hidden="true" className="h-6 w-6" style={{ color: watchProvider.color }} />
          </div>
          <div>
            <h3 className="font-semibold text-gray-900">{watchProvider.name}</h3>
            <p className="text-xs text-gray-500">{watchProvider.description}</p>
          </div>
        </div>
        
        {watchIsConnected ? (
          <button
            onClick={onWatchDisconnect}
            disabled={watchConnecting}
            className="px-4 py-2 bg-red-100 text-red-600 rounded-xl text-sm font-medium hover:bg-red-200 transition-colors flex items-center gap-2"
          >
            {watchConnecting ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <WifiOff className="w-4 h-4" />
            )}
            Disconnect
          </button>
        ) : (
          <button
            onClick={onWatchConnect}
            disabled={watchConnecting}
            className="px-4 py-2 bg-[#3AB1A0] text-white rounded-xl text-sm font-medium hover:bg-[#2A9A8B] transition-colors flex items-center gap-2"
          >
            {watchConnecting ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Wifi className="w-4 h-4" />
            )}
            Connect
          </button>
        )}
      </div>
      
      {/* Supported devices */}
      <div className="mt-3 pt-3 border-t border-gray-100">
        <p className="text-xs text-gray-400 mb-1">Supported:</p>
        <div className="flex flex-wrap gap-1">
          {watchProvider.supported.map((device, i) => (
            <span 
              key={i}
              className="px-2 py-0.5 bg-gray-100 text-gray-600 rounded text-xs"
            >
              {device}
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}

// Watch Providers Configuration
export const WATCH_PROVIDERS = [
  {
    id: 'apple_watch',
    name: 'Apple Watch',
    icon: Watch,
    description: 'Connect via HealthKit',
    color: '#000000',
    supported: ['Apple Watch Series 4+', 'Apple Watch SE', 'Apple Watch Ultra'],
  },
  {
    id: 'google_fit',
    name: 'Google Fit',
    icon: HeartPulse,
    description: 'For Wear OS & Android watches',
    color: '#4285F4',
    supported: ['Wear OS', 'Samsung Galaxy Watch', 'Fossil', 'TicWatch'],
  },
  {
    id: 'fitbit',
    name: 'Fitbit',
    icon: Activity,
    description: 'Connect Fitbit devices',
    color: '#00B0B9',
    supported: ['Fitbit Sense', 'Fitbit Versa', 'Fitbit Charge', 'Fitbit Inspire'],
  },
  {
    id: 'samsung',
    name: 'Samsung Health',
    icon: Heart,
    description: 'For Samsung devices',
    color: '#1428A0',
    supported: ['Galaxy Watch 4', 'Galaxy Watch 5', 'Galaxy Fit'],
  },
  {
    id: 'garmin',
    name: 'Garmin Connect',
    icon: Navigation,
    description: 'For Garmin watches',
    color: '#007CC3',
    supported: ['Garmin Forerunner', 'Garmin Venu', 'Garmin Fenix'],
  },
  {
    id: 'noisefit',
    name: 'NoiseFit / Noise',
    icon: Headphones,
    description: 'ColorFit, NoiseFit watches',
    color: '#FF6B35',
    supported: ['ColorFit Vision 3', 'ColorFit Pro 4', 'NoiseFit Halo', 'ColorFit Pulse'],
  },
  {
    id: 'other',
    name: 'Other Watch',
    icon: Timer,
    description: 'Manual data entry',
    color: '#6B7280',
    supported: ['Mi Band', 'Amazfit', 'Honor Band', 'Other'],
  },
];

export default WatchProviderCard;
