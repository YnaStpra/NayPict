// This module defines storage configuration related enumeration values.

const StorageStatusEnum = {
  NORMAL: 0,
  DISABLE: 1
} as const;

// Only S3-compatible storage (Cloudflare R2) is supported in production.
const StorageTypeEnum = {
  S3: 2
} as const;

type StorageType = (typeof StorageTypeEnum)[keyof typeof StorageTypeEnum];

const StorageTypeOptions = [
  { label: 'objectStorage', value: StorageTypeEnum.S3 }
];

export { StorageStatusEnum, StorageTypeEnum, StorageTypeOptions };
export type { StorageType };
