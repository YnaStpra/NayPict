import { type StorageStrategy } from '@/server/storage/storage-types';

// This module maintains the storage policy registry，For each strategy to realize self-registration。

const strategyMap = new Map<number, () => StorageStrategy>();

// Register the storage policy to strategyMap。
function registerStorageStrategy(type: number, factory: () => StorageStrategy) {
  strategyMap.set(type, factory);
}

// Retrieve policy factory based on storage type。
function resolveStorageStrategy(type: number) {
  return strategyMap.get(type);
}

export { registerStorageStrategy, resolveStorageStrategy };
