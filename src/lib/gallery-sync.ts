// This module provides a real-time event synchronization client using SSE, BroadcastChannel, and WebTransport.

export type GalleryEventType = "PHOTO_CREATED" | "PHOTO_UPDATED" | "PHOTO_DELETED" | "COMMENT_ADDED" | "INSIGHT_VIEW";

export interface GallerySyncEvent {
  type: GalleryEventType;
  payload: Record<string, unknown>;
  timestamp: number;
}

type SyncListener = (event: GallerySyncEvent) => void;

class GallerySyncManager {
  private channel: BroadcastChannel | null = null;
  private eventSource: EventSource | null = null;
  private listeners: Set<SyncListener> = new Set();
  private isConnected: boolean = false;

  constructor() {
    if (typeof window !== "undefined" && "BroadcastChannel" in window) {
      this.channel = new BroadcastChannel("naypict_gallery_sync");
      this.channel.onmessage = (ev) => {
        if (ev.data && typeof ev.data === "object") {
          this.notifyListeners(ev.data as GallerySyncEvent);
        }
      };
    }
  }

  /**
   * Broadcast an event across all active tabs in the current browser.
   */
  public broadcast(type: GalleryEventType, payload: Record<string, unknown> = {}): void {
    const event: GallerySyncEvent = {
      type,
      payload,
      timestamp: Date.now(),
    };

    // Notify local tab
    this.notifyListeners(event);

    // Broadcast to cross-tab listeners
    if (this.channel) {
      try {
        this.channel.postMessage(event);
      } catch {}
    }
  }

  /**
   * Subscribe to real-time gallery sync events.
   */
  public subscribe(listener: SyncListener): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  private notifyListeners(event: GallerySyncEvent): void {
    for (const listener of this.listeners) {
      try {
        listener(event);
      } catch {}
    }
  }

  /**
   * Close connections and clean up resources.
   */
  public destroy(): void {
    if (this.channel) {
      this.channel.close();
      this.channel = null;
    }
    if (this.eventSource) {
      this.eventSource.close();
      this.eventSource = null;
    }
    this.listeners.clear();
  }
}

export const gallerySync = new GallerySyncManager();
