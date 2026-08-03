"use client"

import { create } from "zustand"
import { type StorageSelectVo } from "@/server/entity/vo/storage"

// This module manages storage configuration drop-down option states。

interface StorageState {
  storages: StorageSelectVo[]
  setStorages: (storages: StorageSelectVo[]) => void
}

// Read and update global storage configuration options。
const useStorageStore = create<StorageState>((set) => ({
  storages: [],

  // Set up a list of storage configuration options。
  setStorages: (storages) => set({ storages }),
}))

export { useStorageStore }
