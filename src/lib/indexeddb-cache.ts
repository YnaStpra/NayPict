// This module provides an IndexedDB key-value binary blob cache for PWA offline photo browsing.

const DB_NAME = "pixtale_offline_db";
const STORE_NAME = "photo_blobs";
const EXIF_STORE_NAME = "exif_metadata";
const DB_VERSION = 2;
const MAX_BLOB_ITEMS = 300;
const MAX_EXIF_ITEMS = 1000;

interface CacheEntry {
  photoId: string;
  blob: Blob;
  mimeType: string;
  timestamp: number;
}

interface ExifCacheEntry {
  photoId: string;
  metadata: Record<string, unknown>;
  timestamp: number;
}

class OfflineBlobCache {
  private dbPromise: Promise<IDBDatabase> | null = null;

  private getDB(): Promise<IDBDatabase> {
    if (this.dbPromise) return this.dbPromise;

    this.dbPromise = new Promise((resolve, reject) => {
      if (typeof window === "undefined" || !("indexedDB" in window)) {
        return reject(new Error("IndexedDB not supported"));
      }

      const request = indexedDB.open(DB_NAME, DB_VERSION);

      request.onupgradeneeded = (event) => {
        const db = (event.target as IDBOpenDBRequest).result;
        if (!db.objectStoreNames.contains(STORE_NAME)) {
          const store = db.createObjectStore(STORE_NAME, { keyPath: "photoId" });
          store.createIndex("timestamp", "timestamp", { unique: false });
        }
        if (!db.objectStoreNames.contains(EXIF_STORE_NAME)) {
          const exifStore = db.createObjectStore(EXIF_STORE_NAME, { keyPath: "photoId" });
          exifStore.createIndex("timestamp", "timestamp", { unique: false });
        }
      };

      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });

    return this.dbPromise;
  }

  /**
   * Save photo Blob into IndexedDB cache with LRU eviction.
   */
  public async set(photoId: string, blob: Blob): Promise<void> {
    try {
      const db = await this.getDB();
      const tx = db.transaction(STORE_NAME, "readwrite");
      const store = tx.objectStore(STORE_NAME);

      const entry: CacheEntry = {
        photoId,
        blob,
        mimeType: blob.type,
        timestamp: Date.now(),
      };

      store.put(entry);

      // Clean up oldest items if count exceeds MAX_BLOB_ITEMS
      const countReq = store.count();
      countReq.onsuccess = () => {
        if (countReq.result > MAX_BLOB_ITEMS) {
          const index = store.index("timestamp");
          const cursorReq = index.openCursor();
          let deleted = 0;
          const toDelete = countReq.result - MAX_BLOB_ITEMS;

          cursorReq.onsuccess = (e) => {
            const cursor = (e.target as IDBRequest<IDBCursorWithValue>).result;
            if (cursor && deleted < toDelete) {
              store.delete(cursor.primaryKey);
              deleted++;
              cursor.continue();
            }
          };
        }
      };
    } catch {
      // Gracefully bypass IndexedDB write errors
    }
  }

  /**
   * Retrieve cached photo Blob by photoId.
   */
  public async get(photoId: string): Promise<Blob | null> {
    try {
      const db = await this.getDB();
      return new Promise((resolve) => {
        const tx = db.transaction(STORE_NAME, "readonly");
        const store = tx.objectStore(STORE_NAME);
        const req = store.get(photoId);

        req.onsuccess = () => {
          if (req.result?.blob) {
            resolve(req.result.blob);
          } else {
            resolve(null);
          }
        };
        req.onerror = () => resolve(null);
      });
    } catch {
      return null;
    }
  }

  /**
   * Save parsed EXIF metadata into IndexedDB cache with LRU eviction.
   */
  public async setExif(photoId: string, metadata: Record<string, unknown>): Promise<void> {
    try {
      const db = await this.getDB();
      const tx = db.transaction(EXIF_STORE_NAME, "readwrite");
      const store = tx.objectStore(EXIF_STORE_NAME);

      const entry: ExifCacheEntry = {
        photoId,
        metadata,
        timestamp: Date.now(),
      };

      store.put(entry);

      const countReq = store.count();
      countReq.onsuccess = () => {
        if (countReq.result > MAX_EXIF_ITEMS) {
          const index = store.index("timestamp");
          const cursorReq = index.openCursor();
          let deleted = 0;
          const toDelete = countReq.result - MAX_EXIF_ITEMS;

          cursorReq.onsuccess = (e) => {
            const cursor = (e.target as IDBRequest<IDBCursorWithValue>).result;
            if (cursor && deleted < toDelete) {
              store.delete(cursor.primaryKey);
              deleted++;
              cursor.continue();
            }
          };
        }
      };
    } catch {}
  }

  /**
   * Retrieve cached EXIF metadata by photoId.
   */
  public async getExif(photoId: string): Promise<Record<string, unknown> | null> {
    try {
      const db = await this.getDB();
      return new Promise((resolve) => {
        const tx = db.transaction(EXIF_STORE_NAME, "readonly");
        const store = tx.objectStore(EXIF_STORE_NAME);
        const req = store.get(photoId);

        req.onsuccess = () => {
          if (req.result?.metadata) {
            resolve(req.result.metadata as Record<string, unknown>);
          } else {
            resolve(null);
          }
        };
        req.onerror = () => resolve(null);
      });
    } catch {
      return null;
    }
  }

  /**
   * Clear all offline blobs.
   */
  public async clear(): Promise<void> {
    try {
      const db = await this.getDB();
      const tx = db.transaction([STORE_NAME, EXIF_STORE_NAME], "readwrite");
      tx.objectStore(STORE_NAME).clear();
      tx.objectStore(EXIF_STORE_NAME).clear();
    } catch {}
  }
}

export const offlineBlobCache = new OfflineBlobCache();
export const exifMetadataCache = offlineBlobCache;

