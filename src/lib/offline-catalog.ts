"use client"

import { type PhotoVo } from "@/server/entity/vo/photo"

// This module provides zero-dependency native IndexedDB storage for offline gallery resilience.

const DB_NAME = "naypict_offline_db"
const DB_VERSION = 1
const STORE_NAME = "catalog"
const KEY_INITIAL_PAGE = "initial_page"

export interface OfflineCatalogData {
  photos: PhotoVo[]
  totalCount: number
  savedAt: number
}

function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof window === "undefined" || !("indexedDB" in window)) {
      return reject(new Error("IndexedDB is not supported in this environment"))
    }

    const request = window.indexedDB.open(DB_NAME, DB_VERSION)

    request.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME)
      }
    }

    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
  })
}

// Persist the first page of gallery photos into local IndexedDB storage.
export async function saveOfflineCatalog(photos: PhotoVo[], totalCount: number): Promise<void> {
  if (!photos || photos.length === 0 || typeof window === "undefined") return

  try {
    const db = await openDatabase()
    const tx = db.transaction(STORE_NAME, "readwrite")
    const store = tx.objectStore(STORE_NAME)

    // Store up to 60 photos for initial offline display
    const payload: OfflineCatalogData = {
      photos: photos.slice(0, 60),
      totalCount,
      savedAt: Date.now(),
    }

    store.put(payload, KEY_INITIAL_PAGE)

    return new Promise((resolve) => {
      tx.oncomplete = () => resolve()
      tx.onerror = () => resolve() // Fail gracefully
    })
  } catch (err) {
    console.warn("[OFFLINE-CATALOG] Failed to persist offline catalog:", err)
  }
}

// Retrieve cached gallery catalog from local IndexedDB storage when offline or network fails.
export async function getOfflineCatalog(): Promise<OfflineCatalogData | null> {
  if (typeof window === "undefined" || !("indexedDB" in window)) return null

  try {
    const db = await openDatabase()
    const tx = db.transaction(STORE_NAME, "readonly")
    const store = tx.objectStore(STORE_NAME)
    const request = store.get(KEY_INITIAL_PAGE)

    return new Promise((resolve) => {
      request.onsuccess = () => {
        const result = request.result as OfflineCatalogData | undefined
        resolve(result || null)
      }
      request.onerror = () => resolve(null)
    })
  } catch (err) {
    console.warn("[OFFLINE-CATALOG] Failed to retrieve offline catalog:", err)
    return null
  }
}
