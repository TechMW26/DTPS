// Main index for watchconnectivity module
// This file exports all watch-related functionality from both backend and frontend

// Backend exports
export { 
  WatchHealthData, 
  WatchConnection, 
  WatchService, 
  WATCH_PROVIDER_CONFIGS 
} from './backend/watchIndex';

export type { 
  IWatchHealthData, 
  IWatchConnection, 
  WatchSyncResult, 
  WatchProviderConfig 
} from './backend/watchIndex';

// Frontend exports
export { 
  WatchProviderCard, 
  WatchHealthCard, 
  WatchDashboard, 
  WatchManualEntryModal,
  useWatchConnection,
  WATCH_PROVIDERS,
} from './frontend/watchIndex';

export type { 
  WatchConnectionData, 
  WatchHealthData as WatchHealthDataType,
  WatchManualData 
} from './frontend/watchIndex';
