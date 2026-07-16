// Frontend index - exports all watch frontend modules
export { WatchProviderCard, WATCH_PROVIDERS } from './components/WatchProviderCard';
export { WatchHealthCard } from './components/WatchHealthCard';
export { WatchDashboard } from './components/WatchDashboard';
export { WatchManualEntryModal } from './components/WatchManualEntryModal';
export { useWatchConnection } from './hooks/useWatchConnection';
export type { WatchConnectionData, WatchHealthData } from './hooks/useWatchConnection';
export type { WatchManualData } from './components/WatchManualEntryModal';
