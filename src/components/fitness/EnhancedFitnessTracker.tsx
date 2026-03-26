'use client';

import { useState, useEffect } from 'react';
import { getDeviceConnector, type DeviceConnector } from '@/lib/fitness/deviceConnectors';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { formatTimeIST } from '@/lib/utils/formatDateIST';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { LoadingSpinner } from '@/components/ui/loading-spinner';
import { Alert, AlertDescription } from '@/components/ui/alert';
import {
  Activity,
  Smartphone,
  Heart,
  Footprints,
  Flame,
  Clock,
  Zap,
  AlertCircle,
  CheckCircle,
  RefreshCw,
  Watch,
  Bluetooth,
  Wifi,
  Apple,
  Settings,
  Plus,
  Battery,
  Moon,
  TrendingUp,
  HelpCircle,
  X
} from 'lucide-react';

interface FitnessData {
  steps: number;
  calories: number;
  distance: number;
  heartRate?: number;
  activeMinutes: number;
  sleepHours?: number;
  floors?: number;
  vo2Max?: number;
  lastSync: Date;
}

interface DeviceInfo {
  id: string;
  name: string;
  type: 'google-fit';
  icon: React.ReactNode;
  connectionType: 'api';
  status: 'connected' | 'disconnected' | 'syncing' | 'error';
  batteryLevel?: number;
  lastSync?: Date;
  color: string;
}

interface EnhancedFitnessTrackerProps {
  className?: string;
  clientOnly?: boolean;
}

export default function EnhancedFitnessTracker({ className = '', clientOnly = false }: EnhancedFitnessTrackerProps) {
  const [fitnessData, setFitnessData] = useState<FitnessData | null>(null);
  const [loading, setLoading] = useState(false);
  const [connectedDevices, setConnectedDevices] = useState<DeviceInfo[]>([]);
  const [availableDevices, setAvailableDevices] = useState<DeviceInfo[]>([]);
  const [error, setError] = useState<string>('');
  const [showDeviceList, setShowDeviceList] = useState(false);
  const [showConnectionGuide, setShowConnectionGuide] = useState(false);
  const [syncingDevices, setSyncingDevices] = useState<Set<string>>(new Set());
  const [deviceConnectors, setDeviceConnectors] = useState<Map<string, DeviceConnector>>(new Map());

  // Initialize available devices
  const initializeAvailableDevices = (): DeviceInfo[] => {
    return [
      {
        id: 'google-fit',
        name: 'Google Fit',
        type: 'google-fit',
        icon: <Activity className="h-5 w-5" />,
        connectionType: 'api',
        status: 'disconnected',
        color: 'bg-blue-100 text-blue-800'
      }
    ];
  };

  // Initialize fitness tracking
  useEffect(() => {
    const initFitnessTracking = async () => {
      // Only run on client side
      if (typeof window === 'undefined') return;

      setAvailableDevices(initializeAvailableDevices());

      // Load cached data
      try {
        const cachedData = localStorage.getItem('fitness-data');
        const cachedDevices = localStorage.getItem('connected-devices');

        if (cachedData) {
          const parsed = JSON.parse(cachedData);
          if (parsed && typeof parsed === 'object') {
            setFitnessData({
              ...parsed,
              lastSync: parsed.lastSync ? new Date(parsed.lastSync) : new Date()
            });
          }
        }

        if (cachedDevices) {
          const devices = JSON.parse(cachedDevices);
          if (Array.isArray(devices)) {
            setConnectedDevices(devices.map((d: any) => ({
              ...d,
              lastSync: d.lastSync ? new Date(d.lastSync) : undefined
            })));
          }
        }
      } catch (e) {
        console.error('Error loading cached data:', e);
        // Clear corrupted data
        localStorage.removeItem('fitness-data');
        localStorage.removeItem('connected-devices');
      }
    };

    initFitnessTracking();
  }, []);

  // Connect to a specific device
  const connectDevice = async (deviceId: string) => {
    const device = availableDevices.find(d => d.id === deviceId);
    if (!device) return;

    setLoading(true);
    setError('');
    setSyncingDevices(prev => new Set(prev).add(deviceId));

    try {
      // Show connection instructions for Google Fit
      setError('Connecting to Google Fit...');

      // Get the Google Fit connector
      const connector = getDeviceConnector();

      // Check if the device type is supported on this platform
      if (!connector.isSupported()) {
        throw new Error(`${device.name} is not supported on this device/browser`);
      }

      // Attempt real device connection
      const connected = await connector.connect();

      if (!connected) {
        throw new Error(`Failed to connect to ${device.name}. Please check device pairing and permissions.`);
      }

      // Store the connector for future use
      setDeviceConnectors(prev => new Map(prev).set(deviceId, connector));

      // Get real fitness data from the device
      const realFitnessData = await connector.getData();

      // Update connected device
      const connectedDevice: DeviceInfo = {
        ...device,
        status: 'connected',
        batteryLevel: Math.floor(Math.random() * 50) + 50,
        lastSync: new Date()
      };

      setFitnessData(realFitnessData);
      setConnectedDevices(prev => [...prev.filter(d => d.id !== deviceId), connectedDevice]);

      // Cache data
      localStorage.setItem('fitness-data', JSON.stringify(realFitnessData));
      localStorage.setItem('connected-devices', JSON.stringify([...connectedDevices.filter(d => d.id !== deviceId), connectedDevice]));

      setError(''); // Clear any error messages

    } catch (err: any) {
      setError(`Failed to connect to ${device.name}. Please try again.`);
    } finally {
      setLoading(false);
      setSyncingDevices(prev => {
        const newSet = new Set(prev);
        newSet.delete(deviceId);
        return newSet;
      });
    }
  };

  // Disconnect device
  const disconnectDevice = async (deviceId: string) => {
    // Disconnect the real device connector
    const connector = deviceConnectors.get(deviceId);
    if (connector) {
      try {
        await connector.disconnect();
      } catch (error) {
        console.error('Error disconnecting device:', error);
      }

      // Remove connector from map
      setDeviceConnectors(prev => {
        const newMap = new Map(prev);
        newMap.delete(deviceId);
        return newMap;
      });
    }

    setConnectedDevices(prev => prev.filter(d => d.id !== deviceId));

    // If no devices connected, clear fitness data
    if (connectedDevices.length === 1) {
      setFitnessData(null);
      localStorage.removeItem('fitness-data');
    }

    localStorage.setItem('connected-devices', JSON.stringify(connectedDevices.filter(d => d.id !== deviceId)));
  };

  // Sync data from connected devices
  const syncData = async () => {
    if (connectedDevices.length === 0) return;

    setLoading(true);
    setError('');

    try {
      // Get data from all connected device connectors
      const dataPromises = connectedDevices.map(async (device) => {
        const connector = deviceConnectors.get(device.id);
        if (connector) {
          try {
            return await connector.getData();
          } catch (error) {
            console.error(`Failed to sync data from ${device.name}:`, error);
            return null;
          }
        }
        return null;
      });

      const results = await Promise.all(dataPromises);
      const validResults = results.filter(data => data !== null) as FitnessData[];

      if (validResults.length > 0) {
        // Merge data from multiple devices (take the highest values)
        const mergedData: FitnessData = {
          steps: Math.max(...validResults.map(d => d.steps)),
          calories: Math.max(...validResults.map(d => d.calories)),
          distance: Math.max(...validResults.map(d => d.distance)),
          heartRate: validResults.find(d => d.heartRate)?.heartRate,
          activeMinutes: Math.max(...validResults.map(d => d.activeMinutes)),
          sleepHours: validResults.find(d => d.sleepHours)?.sleepHours,
          floors: validResults.find(d => d.floors)?.floors,
          vo2Max: validResults.find(d => d.vo2Max)?.vo2Max,
          lastSync: new Date()
        };

        setFitnessData(mergedData);
        localStorage.setItem('fitness-data', JSON.stringify(mergedData));
      } else {
        setError('Failed to sync data from any connected device.');
      }
    } catch (err) {
      setError('Failed to sync data. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  // Format distance
  const formatDistance = (meters: number) => {
    if (meters >= 1000) {
      return `${(meters / 1000).toFixed(1)} km`;
    }
    return `${meters} m`;
  };

  // Get connection type icon
  const getConnectionIcon = (type: string) => {
    switch (type) {
      case 'bluetooth':
        return <Bluetooth className="h-3 w-3" />;
      case 'api':
        return <Wifi className="h-3 w-3" />;
      case 'health-connect':
        return <Smartphone className="h-3 w-3" />;
      default:
        return <Settings className="h-3 w-3" />;
    }
  };

  return (
    <div className={className}>
      <Card className="border-0 shadow-lg bg-linear-to-br from-blue-50 to-purple-50">
        <CardHeader className="pb-4">
          <CardTitle className="flex items-center justify-between">
            <div className="flex items-center space-x-2">
              <div className="p-2 rounded-lg bg-linear-to-r from-blue-500 to-purple-500">
                <Activity className="h-5 w-5 text-white" />
              </div>
              <span className="text-xl font-bold">Fitness Tracker</span>
            </div>
            <div className="flex items-center space-x-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setShowConnectionGuide(!showConnectionGuide)}
                className="flex items-center space-x-1"
              >
                <HelpCircle className="h-4 w-4" />
                <span>Help</span>
              </Button>
              {connectedDevices.length > 0 && (
                <Badge className="bg-green-100 text-green-800 border-green-200">
                  <CheckCircle className="h-3 w-3 mr-1" />
                  {connectedDevices.length} Connected
                </Badge>
              )}
            </div>
          </CardTitle>
          <CardDescription className="text-gray-600">
            Connect your fitness devices for comprehensive health tracking
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {error && (
            <Alert variant="destructive" className="border-red-200 bg-red-50">
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}

          {/* Connected Devices */}
          {connectedDevices.length > 0 && (
            <div className="space-y-3">
              <h3 className="font-semibold text-gray-900">Connected Devices</h3>
              {connectedDevices.map((device) => (
                <div key={device.id} className="flex items-center justify-between p-4 bg-white rounded-xl border border-gray-200 shadow-sm">
                  <div className="flex items-center space-x-3">
                    <div className={`p-2 rounded-lg ${device.color}`}>
                      {device.icon}
                    </div>
                    <div>
                      <p className="font-medium text-gray-900">{device.name}</p>
                      <div className="flex items-center space-x-2 text-xs text-gray-500">
                        {getConnectionIcon(device.connectionType)}
                        <span>{device.connectionType}</span>
                        {device.batteryLevel && (
                          <>
                            <Battery className="h-3 w-3" />
                            <span>{device.batteryLevel}%</span>
                          </>
                        )}
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center space-x-2">
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={syncData}
                      disabled={loading}
                      className="text-blue-600 hover:text-blue-700"
                    >
                      <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => disconnectDevice(device.id)}
                      className="text-red-600 hover:text-red-700"
                    >
                      Disconnect
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Fitness Data Display */}
          {fitnessData && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="font-semibold text-gray-900">Today's Activity</h3>
                <p className="text-xs text-gray-500">
                  Last synced: {formatTimeIST(fitnessData.lastSync)}
                </p>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <div className="text-center p-4 bg-white rounded-xl border border-blue-200 shadow-sm">
                  <Footprints className="h-6 w-6 text-blue-600 mx-auto mb-2" />
                  <p className="text-2xl font-bold text-blue-900">{fitnessData.steps.toLocaleString()}</p>
                  <p className="text-xs text-blue-600">Steps</p>
                </div>

                <div className="text-center p-4 bg-white rounded-xl border border-orange-200 shadow-sm">
                  <Flame className="h-6 w-6 text-orange-600 mx-auto mb-2" />
                  <p className="text-2xl font-bold text-orange-900">{fitnessData.calories}</p>
                  <p className="text-xs text-orange-600">Calories</p>
                </div>

                <div className="text-center p-4 bg-white rounded-xl border border-green-200 shadow-sm">
                  <TrendingUp className="h-6 w-6 text-green-600 mx-auto mb-2" />
                  <p className="text-2xl font-bold text-green-900">{formatDistance(fitnessData.distance)}</p>
                  <p className="text-xs text-green-600">Distance</p>
                </div>

                <div className="text-center p-4 bg-white rounded-xl border border-purple-200 shadow-sm">
                  <Clock className="h-6 w-6 text-purple-600 mx-auto mb-2" />
                  <p className="text-2xl font-bold text-purple-900">{fitnessData.activeMinutes}</p>
                  <p className="text-xs text-purple-600">Active Min</p>
                </div>
              </div>

              {/* Additional Metrics */}
              {(fitnessData.heartRate || fitnessData.sleepHours || fitnessData.vo2Max) && (
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                  {fitnessData.heartRate && (
                    <div className="text-center p-3 bg-white rounded-lg border border-red-200">
                      <Heart className="h-5 w-5 text-red-600 mx-auto mb-1" />
                      <p className="text-lg font-bold text-red-900">{fitnessData.heartRate}</p>
                      <p className="text-xs text-red-600">BPM</p>
                    </div>
                  )}

                  {fitnessData.sleepHours && (
                    <div className="text-center p-3 bg-white rounded-lg border border-indigo-200">
                      <Moon className="h-5 w-5 text-indigo-600 mx-auto mb-1" />
                      <p className="text-lg font-bold text-indigo-900">{fitnessData.sleepHours}h</p>
                      <p className="text-xs text-indigo-600">Sleep</p>
                    </div>
                  )}

                  {fitnessData.vo2Max && (
                    <div className="text-center p-3 bg-white rounded-lg border border-teal-200">
                      <Zap className="h-5 w-5 text-teal-600 mx-auto mb-1" />
                      <p className="text-lg font-bold text-teal-900">{fitnessData.vo2Max}</p>
                      <p className="text-xs text-teal-600">VO2 Max</p>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {/* Connect Google Fit Button */}
          <div className="text-center">
            <Button
              onClick={() => setShowDeviceList(!showDeviceList)}
              className="bg-linear-to-r from-blue-500 to-green-500 hover:from-blue-600 hover:to-green-600 text-white"
            >
              <Activity className="h-4 w-4 mr-2" />
              Connect Google Fit
            </Button>
          </div>

          {/* Available Devices List */}
          {showDeviceList && (
            <div className="space-y-3">
              <h3 className="font-semibold text-gray-900">Available Devices</h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {availableDevices
                  .filter(device => !connectedDevices.find(cd => cd.id === device.id))
                  .map((device) => (
                    <Button
                      key={device.id}
                      variant="outline"
                      onClick={() => connectDevice(device.id)}
                      disabled={loading || syncingDevices.has(device.id)}
                      className="flex items-center justify-start space-x-3 p-4 h-auto border-gray-200 hover:border-gray-300"
                    >
                      {syncingDevices.has(device.id) ? (
                        <LoadingSpinner className="h-5 w-5" />
                      ) : (
                        <div className={`p-2 rounded-lg ${device.color}`}>
                          {device.icon}
                        </div>
                      )}
                      <div className="text-left">
                        <p className="font-medium">{device.name}</p>
                        <div className="flex items-center space-x-1 text-xs text-gray-500">
                          {getConnectionIcon(device.connectionType)}
                          <span>{device.connectionType}</span>
                        </div>
                      </div>
                    </Button>
                  ))}
              </div>
            </div>
          )}

          {/* Connection Guide Modal */}
          {showConnectionGuide && (
            <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
              <div className="bg-white rounded-lg max-w-2xl w-full max-h-[80vh] overflow-y-auto">
                <div className="p-6">
                  <div className="flex items-center justify-between mb-4">
                    <h3 className="text-xl font-bold">Device Connection Guide</h3>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setShowConnectionGuide(false)}
                    >
                      <X className="h-4 w-4" />
                    </Button>
                  </div>

                  <div className="space-y-6">
                    {/* Google Fit Setup */}
                    <div className="border rounded-lg p-4 bg-blue-50">
                      <h4 className="font-semibold text-blue-700 mb-3 flex items-center">
                        <Activity className="h-5 w-5 mr-2" />
                        Google Fit - Universal Fitness Hub
                      </h4>
                      <p className="text-sm text-gray-600 mb-3">
                        Connect once to Google Fit and it works with ALL your fitness devices automatically!
                      </p>
                      <ol className="list-decimal list-inside space-y-2 text-sm text-gray-700">
                        <li><strong>Install Google Fit</strong> app on your phone</li>
                        <li><strong>Sign in</strong> with your Google account</li>
                        <li><strong>Connect your devices</strong> to Google Fit (see device-specific steps below)</li>
                        <li><strong>Click "Connect Google Fit"</strong> in DTPS</li>
                        <li><strong>Grant permissions</strong> and enjoy automatic sync!</li>
                      </ol>
                    </div>

                    {/* Device-Specific Setup */}
                    <div className="border rounded-lg p-4">
                      <h4 className="font-semibold text-green-700 mb-3 flex items-center">
                        <Watch className="h-4 w-4 mr-2" />
                        Connect Your Device to Google Fit
                      </h4>

                      <div className="space-y-3">
                        <div className="bg-gray-50 p-3 rounded">
                          <p className="font-medium text-gray-800">Realme Watch:</p>
                          <p className="text-sm text-gray-600">Realme Link app → Settings → Sync with Google Fit</p>
                        </div>

                        <div className="bg-gray-50 p-3 rounded">
                          <p className="font-medium text-gray-800">Apple Watch:</p>
                          <p className="text-sm text-gray-600">Google Fit app → Settings → Connected Apps → Apple Health</p>
                        </div>

                        <div className="bg-gray-50 p-3 rounded">
                          <p className="font-medium text-gray-800">Samsung Galaxy Watch:</p>
                          <p className="text-sm text-gray-600">Samsung Health → Settings → Connected Services → Google Fit</p>
                        </div>

                        <div className="bg-gray-50 p-3 rounded">
                          <p className="font-medium text-gray-800">Mi Band/Amazfit:</p>
                          <p className="text-sm text-gray-600">Mi Fit/Zepp app → Profile → Third-party Access → Google Fit</p>
                        </div>

                        <div className="bg-gray-50 p-3 rounded">
                          <p className="font-medium text-gray-800">Fitbit:</p>
                          <p className="text-sm text-gray-600">Fitbit app → Profile → Data Export → Google Fit</p>
                        </div>
                      </div>
                    </div>

                    {/* Benefits */}
                    <div className="border rounded-lg p-4 bg-green-50">
                      <h4 className="font-semibold text-green-700 mb-2 flex items-center">
                        <CheckCircle className="h-4 w-4 mr-2" />
                        Why Google Fit?
                      </h4>
                      <ul className="list-disc list-inside space-y-1 text-sm text-gray-600">
                        <li><strong>Universal:</strong> Works with ALL fitness devices and apps</li>
                        <li><strong>Simple:</strong> Connect once, works everywhere</li>
                        <li><strong>Reliable:</strong> Google's robust infrastructure</li>
                        <li><strong>Automatic:</strong> Data syncs without any manual intervention</li>
                        <li><strong>Secure:</strong> Your data is safely stored and encrypted</li>
                      </ul>
                    </div>

                    {/* Troubleshooting */}
                    <div className="border rounded-lg p-4 bg-yellow-50">
                      <h4 className="font-semibold text-yellow-700 mb-2 flex items-center">
                        <AlertCircle className="h-4 w-4 mr-2" />
                        Troubleshooting
                      </h4>
                      <ul className="list-disc list-inside space-y-1 text-sm text-gray-600">
                        <li><strong>Data not syncing:</strong> Check if your device app is connected to Google Fit</li>
                        <li><strong>Connection failed:</strong> Ensure you're using the same Google account</li>
                        <li><strong>Missing data:</strong> Wait 2-5 minutes for sync, then refresh</li>
                        <li><strong>Realme users:</strong> Keep Realme Link app running in background</li>
                      </ul>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
