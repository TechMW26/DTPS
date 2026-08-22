'use client';

import { useState, useEffect } from 'react';
import { useSession } from 'next-auth/react';
import Link from 'next/link';
import PageTransition from '@/components/animations/PageTransition';
import { useTheme } from '@/contexts/ThemeContext';
import { 
  ArrowLeft, 
  RefreshCw, 
  Settings, 
  Watch, 
  Plus,
  Wifi,
  WifiOff,
  Clock,
  ChevronRight,
  Loader2,
  Lightbulb,
  LightbulbOff,
  BarChart3,
  TrendingUp,
  Info,
  Apple,
  Headphones
} from 'lucide-react';
import { format } from 'date-fns';
import { toast } from 'sonner';

import { ClientPageSkeleton } from '@/components/ui/skeleton';
import { 
  useWatchConnection, 
  WatchDashboard, 
  WatchProviderCard, 
  WatchManualEntryModal,
  WATCH_PROVIDERS,
} from '@/watchconnectivity/frontend/watchIndex';
import type { WatchManualData } from '@/watchconnectivity/frontend/watchIndex';

export default function WatchPage() {
  const { data: session, status } = useSession();
  const {
    watchConnection,
    watchHealthData,
    watchLoading,
    watchSyncing,
    watchError,
    connectWatch,
    disconnectWatch,
    syncWatchData,
    saveWatchData,
    refreshWatchConnection,
  } = useWatchConnection();

  const [watchActiveTab, setWatchActiveTab] = useState<'dashboard' | 'connect'>('dashboard');
  const [watchConnecting, setWatchConnecting] = useState<string | null>(null);
  const [watchManualModalOpen, setWatchManualModalOpen] = useState(false);
  const [watchFlashlightOn, setWatchFlashlightOn] = useState(false);
  const [watchFlashlightLoading, setWatchFlashlightLoading] = useState(false);

  // Check URL params for success/error and auto-sync after OAuth
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const success = params.get('success');
    const error = params.get('error');

    if (success === 'connected') {
      toast.success('Watch connected successfully! Syncing data...');
      refreshWatchConnection();
      // Auto-sync data after connection
      setTimeout(async () => {
        const synced = await syncWatchData();
        if (synced) {
          toast.success('Health data synced from watch!');
        }
      }, 1000);
    }

    if (error) {
      toast.error(`Connection failed: ${error}`);
    }

    // Clean URL
    if (success || error) {
      window.history.replaceState({}, '', '/user/watch');
    }
  }, [refreshWatchConnection, syncWatchData]);

  const handleWatchConnect = async (providerId: string) => {
    // For NoiseFit, show special instructions
    if (providerId === 'noisefit') {
      toast.info('Sync your NoiseFit app to Google Fit, then connect Google Fit for automatic data syncing.', {
        icon: <Lightbulb className="h-4 w-4" />,
        duration: 6000,
      });
    }
    
    setWatchConnecting(providerId);
    try {
      const result = await connectWatch(providerId);
      if (result) {
        toast.success('Watch connected! Use Manual Entry or sync via Google Fit.');
      }
    } catch (error) {
      toast.error('Failed to connect watch');
    } finally {
      setWatchConnecting(null);
    }
  };

  const handleWatchDisconnect = async () => {
    try {
      const success = await disconnectWatch();
      if (success) {
        toast.success('Watch disconnected');
        setWatchFlashlightOn(false);
      }
    } catch (error) {
      toast.error('Failed to disconnect watch');
    }
  };

  // Handle flashlight toggle - sends signal to watch
  const handleWatchFlashlight = async () => {
    if (!watchConnection?.watchIsConnected) {
      toast.error('Watch not connected');
      return;
    }

    setWatchFlashlightLoading(true);
    try {
      // Toggle flashlight state
      const newState = !watchFlashlightOn;
      setWatchFlashlightOn(newState);
      
      // Send command to watch (via API if supported)
      const response = await fetch('/api/watch/flashlight', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: newState ? 'on' : 'off' }),
      });
      
      const data = await response.json();
      
      if (data.success) {
        toast.success(newState ? 'Flashlight on' : 'Flashlight off', { icon: newState ? <Lightbulb className="h-4 w-4" /> : <LightbulbOff className="h-4 w-4" /> });
      } else {
        // Even if API fails, show visual feedback (watch might not support remote flashlight)
        toast.info(newState ? 'Flashlight-on signal sent.' : 'Flashlight-off signal sent.', { icon: newState ? <Lightbulb className="h-4 w-4" /> : <LightbulbOff className="h-4 w-4" /> });
      }
    } catch (error) {
      // Show visual feedback even on error
      toast.info(watchFlashlightOn ? 'Flashlight on (visual preview only).' : 'Flashlight off (visual preview only).', { icon: watchFlashlightOn ? <Lightbulb className="h-4 w-4" /> : <LightbulbOff className="h-4 w-4" /> });
    } finally {
      setWatchFlashlightLoading(false);
    }
  };

  const handleWatchSync = async () => {
    // Check if NoiseFit - show special message
    if (watchConnection?.watchProvider === 'noisefit') {
      toast.info('NoiseFit doesn\'t support direct sync. Use Manual Entry or connect via Google Fit.', {
        duration: 5000,
      });
      // Still try to sync to update last sync time
    }
    
    const success = await syncWatchData();
    if (success) {
      toast.success('Data synced successfully!');
    } else {
      // Show helpful message based on provider
      if (watchConnection?.watchProvider === 'noisefit') {
        toast.error('NoiseFit requires Google Fit sync. Enable "Sync to Google Fit" in NoiseFit app.');
      } else {
        toast.error('Failed to sync data. Try reconnecting your watch.');
      }
    }
  };

  const handleWatchManualSave = async (data: WatchManualData): Promise<boolean> => {
    const success = await saveWatchData(data as any);
    if (success) {
      toast.success('Data saved successfully!');
    }
    return success;
  };

  if (status === 'loading' || watchLoading) {
    return <ClientPageSkeleton variant="home" showHeader={false} />;
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="px-4 py-4 bg-white border-b border-gray-100">
        <div className="flex items-center justify-between">
          <Link href="/user" className="p-2 -ml-2">
            <ArrowLeft className="w-6 h-6 text-gray-700" />
          </Link>
          <div className="text-center">
            <h1 className="text-lg font-bold text-[#3AB1A0]">⌚ Watch Connect</h1>
            <p className="text-xs text-gray-500">Track your health metrics</p>
          </div>
          <div className="flex items-center gap-2">
            <button 
              onClick={handleWatchSync}
              disabled={watchSyncing || !watchConnection?.watchIsConnected}
              className="p-2 disabled:opacity-50"
            >
              <RefreshCw className={`w-5 h-5 text-gray-700 ${watchSyncing ? 'animate-spin' : ''}`} />
            </button>
            <div className="w-8 h-8 rounded-full bg-[#3AB1A0] flex items-center justify-center text-white text-sm font-semibold">
              {session?.user?.name?.charAt(0) || 'U'}
            </div>
          </div>
        </div>
      </div>

      {/* Connection Status Banner */}
      {watchConnection?.watchIsConnected ? (
        <div className="px-4 py-4 bg-linear-to-r from-[#3AB1A0] to-[#2A9A8B] text-white">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 bg-white/20 rounded-2xl flex items-center justify-center">
                <Wifi className="w-6 h-6" />
              </div>
              <div>
                <p className="font-semibold">{watchConnection.watchDeviceName || 'Connected Watch'}</p>
                <p className="text-xs opacity-90">
                  {WATCH_PROVIDERS.find(p => p.id === watchConnection.watchProvider)?.name || watchConnection.watchProvider}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-3">
              {/* Flashlight Button */}
              <button
                onClick={handleWatchFlashlight}
                disabled={watchFlashlightLoading}
                className={`w-12 h-12 rounded-2xl flex items-center justify-center transition-all ${
                  watchFlashlightOn 
                    ? 'bg-yellow-400 shadow-lg shadow-yellow-400/50' 
                    : 'bg-white/20 hover:bg-white/30'
                }`}
                title={watchFlashlightOn ? 'Turn Off Flashlight' : 'Turn On Flashlight'}
              >
                {watchFlashlightLoading ? (
                  <Loader2 className="w-6 h-6 animate-spin" />
                ) : watchFlashlightOn ? (
                  <Lightbulb className="w-6 h-6 text-gray-900" />
                ) : (
                  <LightbulbOff className="w-6 h-6" />
                )}
              </button>
              <div className="text-right">
                <p className="text-xs opacity-90">Last Sync</p>
                <p className="text-sm font-medium">
                  {watchConnection.watchLastSync 
                    ? format(new Date(watchConnection.watchLastSync), 'h:mm a')
                    : 'Never'
                  }
                </p>
              </div>
            </div>
          </div>
        </div>
      ) : (
        <div className="px-4 py-4 bg-linear-to-r from-gray-600 to-gray-700 text-white">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 bg-white/20 rounded-2xl flex items-center justify-center">
              <WifiOff className="w-6 h-6" />
            </div>
            <div>
              <p className="font-semibold">No Watch Connected</p>
              <p className="text-xs opacity-90">Connect your watch to track health</p>
            </div>
          </div>
        </div>
      )}

      {/* Tabs */}
      <div className="px-4 py-3 bg-white border-b border-gray-100">
        <div className="flex gap-2">
          <button
            onClick={() => setWatchActiveTab('dashboard')}
            className={`flex-1 py-2 px-4 rounded-xl text-sm font-medium transition-colors ${
              watchActiveTab === 'dashboard'
                ? 'bg-[#3AB1A0] text-white'
                : 'bg-gray-100 text-gray-600'
            }`}
          >
            <span className="inline-flex items-center justify-center gap-2"><BarChart3 aria-hidden="true" className="h-4 w-4" /> Dashboard</span>
          </button>
          <button
            onClick={() => setWatchActiveTab('connect')}
            className={`flex-1 py-2 px-4 rounded-xl text-sm font-medium transition-colors ${
              watchActiveTab === 'connect'
                ? 'bg-[#3AB1A0] text-white'
                : 'bg-gray-100 text-gray-600'
            }`}
          >
            <span className="inline-flex items-center justify-center gap-2"><Watch aria-hidden="true" className="h-4 w-4" /> Connect</span>
          </button>
        </div>
      </div>

      {/* Content */}
      <div className="px-4 py-6">
        {watchActiveTab === 'dashboard' ? (
          <>
            {/* Quick Actions */}
            <div className="flex gap-2 mb-4">
              <button
                onClick={() => setWatchManualModalOpen(true)}
                className="flex-1 py-3 px-4 bg-white rounded-xl shadow-sm flex items-center justify-center gap-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
              >
                <Plus className="w-4 h-4" />
                Manual Entry
              </button>
              <button
                onClick={handleWatchSync}
                disabled={watchSyncing || !watchConnection?.watchIsConnected}
                className="flex-1 py-3 px-4 bg-[#E06A26] text-white rounded-xl shadow-sm flex items-center justify-center gap-2 text-sm font-medium hover:bg-[#D05A16] disabled:opacity-50"
              >
                {watchSyncing ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <RefreshCw className="w-4 h-4" />
                )}
                Sync Now
              </button>
            </div>

            {/* Health Dashboard */}
            <div className="mb-4">
              <h2 className="text-sm font-bold text-gray-900 mb-3">Today's Health</h2>
              <WatchDashboard
                watchHealthData={watchHealthData}
                watchLoading={watchLoading}
              />
            </div>

            {/* Quick Stats */}
            {watchHealthData && (
              <div className="bg-white rounded-2xl p-4 shadow-sm">
                <h3 className="mb-3 flex items-center gap-2 text-sm font-bold text-gray-900"><TrendingUp aria-hidden="true" className="h-4 w-4" /> Summary</h3>
                <div className="space-y-3">
                  <div className="flex items-center justify-between py-2 border-b border-gray-100">
                    <span className="text-sm text-gray-600">Total Steps</span>
                    <span className="text-sm font-semibold text-[#3AB1A0]">
                      {watchHealthData.watchSteps?.count?.toLocaleString() || 0}
                    </span>
                  </div>
                  <div className="flex items-center justify-between py-2 border-b border-gray-100">
                    <span className="text-sm text-gray-600">Calories Burned</span>
                    <span className="text-sm font-semibold text-[#E06A26]">
                      {watchHealthData.watchCalories?.total?.toLocaleString() || 0} kcal
                    </span>
                  </div>
                  <div className="flex items-center justify-between py-2 border-b border-gray-100">
                    <span className="text-sm text-gray-600">Sleep Duration</span>
                    <span className="text-sm font-semibold text-[#6366F1]">
                      {watchHealthData.watchSleep?.totalHours?.toFixed(1) || 0} hours
                    </span>
                  </div>
                  <div className="flex items-center justify-between py-2">
                    <span className="text-sm text-gray-600">Active Minutes</span>
                    <span className="text-sm font-semibold text-[#8B5CF6]">
                      {watchHealthData.watchActivity?.activeMinutes || 0} min
                    </span>
                  </div>
                </div>
              </div>
            )}
          </>
        ) : (
          <>
            {/* Watch Providers */}
            <h2 className="text-sm font-bold text-gray-900 mb-3">Connect Your Watch</h2>
            <div className="space-y-3">
              {WATCH_PROVIDERS.map((provider) => (
                <WatchProviderCard
                  key={provider.id}
                  watchProvider={provider}
                  watchIsConnected={watchConnection?.watchProvider === provider.id && watchConnection?.watchIsConnected}
                  onWatchConnect={() => handleWatchConnect(provider.id)}
                  onWatchDisconnect={handleWatchDisconnect}
                  watchConnecting={watchConnecting === provider.id}
                />
              ))}
            </div>

            {/* Info Section */}
            <div className="mt-6 p-4 bg-blue-50 rounded-2xl">
              <h3 className="mb-2 flex items-center gap-2 text-sm font-bold text-blue-900"><Info aria-hidden="true" className="h-4 w-4" /> How it works</h3>
              <ul className="space-y-2 text-xs text-blue-800">
                <li className="flex items-start gap-2">
                  <span>1.</span>
                  <span>Select your watch type from the list above</span>
                </li>
                <li className="flex items-start gap-2">
                  <span>2.</span>
                  <span>Authorize access to your health data</span>
                </li>
                <li className="flex items-start gap-2">
                  <span>3.</span>
                  <span>Your data will sync automatically every 30 minutes</span>
                </li>
                <li className="flex items-start gap-2">
                  <span>4.</span>
                  <span>View all metrics in the Dashboard tab</span>
                </li>
              </ul>
            </div>

            {/* Apple Watch Note */}
            <div className="mt-4 p-4 bg-gray-100 rounded-2xl">
              <h3 className="mb-2 flex items-center gap-2 text-sm font-bold text-gray-900"><Apple aria-hidden="true" className="h-4 w-4" /> Apple Watch users</h3>
              <p className="text-xs text-gray-600">
                Apple Watch uses HealthKit which requires our iOS app for data sync. 
                Download the app from App Store or use manual entry for now.
              </p>
            </div>

            {/* NoiseFit Note */}
            <div className="mt-4 p-4 bg-orange-50 rounded-2xl border border-orange-200">
              <h3 className="mb-2 flex items-center gap-2 text-sm font-bold text-orange-900"><Headphones aria-hidden="true" className="h-4 w-4" /> NoiseFit and ColorFit users</h3>
              <p className="text-xs text-orange-700 mb-2">
                NoiseFit watches (ColorFit Vision, ColorFit Pro, etc.) don't have a public API. 
                You have two options:
              </p>
              <ul className="text-xs text-orange-700 space-y-1 ml-4 list-disc">
                <li><strong>Option 1:</strong> Use "Manual Entry" to log your health data</li>
                <li><strong>Option 2:</strong> Sync NoiseFit app → Google Fit → Connect via Google Fit</li>
              </ul>
              <p className="text-xs text-orange-600 mt-2 italic">
                <span className="inline-flex items-start gap-1.5"><Lightbulb aria-hidden="true" className="mt-0.5 h-3.5 w-3.5 shrink-0" /> Tip: Open the NoiseFit app, then go to Profile → Settings and enable “Sync to Google Fit.”</span>
              </p>
            </div>
          </>
        )}
      </div>

      {/* Manual Entry Modal */}
      <WatchManualEntryModal
        watchIsOpen={watchManualModalOpen}
        onWatchClose={() => setWatchManualModalOpen(false)}
        onWatchSave={handleWatchManualSave}
      />

      {/* Error Toast */}
      {watchError && (
        <div className="fixed bottom-20 left-4 right-4 bg-red-500 text-white px-4 py-3 rounded-xl text-sm text-center">
          {watchError}
        </div>
      )}
    </div>
  );
}
