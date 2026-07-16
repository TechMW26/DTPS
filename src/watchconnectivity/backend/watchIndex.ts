// Backend index - exports all watch backend modules
export { default as WatchHealthData } from './models/WatchHealthData';
export { default as WatchConnection } from './models/WatchConnection';
export { WatchService, WATCH_PROVIDER_CONFIGS } from './services/WatchService';
export type { IWatchHealthData } from './models/WatchHealthData';
export type { IWatchConnection } from './models/WatchConnection';
export type { WatchSyncResult, WatchProviderConfig } from './services/WatchService';
