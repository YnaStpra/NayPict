// This module defines Value Objects for real-time catalog state synchronization.

export interface CatalogSyncVersionVo {
  // Global version timestamp in milliseconds
  v: number;
  // Album entity version timestamp
  albumV: number;
  // Photo entity version timestamp
  photoV: number;
  // Total public gallery photos count
  photoCount: number;
}
