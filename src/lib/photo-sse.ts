// This module manages real-time event distribution across UI components and browser tabs
// using BroadcastChannel without opening long-lived serverless SSE streams, preserving Vercel compute quotas.

type SseCallback = (payload: unknown) => void;

interface PhotoBroadcastMessage {
  photoId: string;
  eventName: string;
  payload: unknown;
}

class PhotoSseManager {
  private listeners = new Map<string, Set<SseCallback>>();
  private channel: BroadcastChannel | null = null;

  constructor() {
    if (typeof window !== "undefined" && "BroadcastChannel" in window) {
      try {
        this.channel = new BroadcastChannel("naypict_photo_events");
        this.channel.onmessage = (event: MessageEvent<PhotoBroadcastMessage>) => {
          const { photoId, eventName, payload } = event.data || {};
          if (photoId && eventName) {
            this.dispatch(photoId, eventName, payload);
          }
        };
      } catch (err) {
        console.warn("[PHOTO-EVENTS] BroadcastChannel unavailable:", err);
      }
    }
  }

  // Subscribe a component to a specific event on a photo.
  // Returns an unsubscribe function.
  public subscribe(photoId: string, eventName: string, callback: SseCallback): () => void {
    if (!photoId) return () => {};

    const cleanId = photoId.trim();
    const key = `${cleanId}:${eventName}`;

    if (!this.listeners.has(key)) {
      this.listeners.set(key, new Set());
    }
    this.listeners.get(key)!.add(callback);

    return () => {
      const set = this.listeners.get(key);
      if (set) {
        set.delete(callback);
        if (set.size === 0) {
          this.listeners.delete(key);
        }
      }
    };
  }

  // Publish an event locally and broadcast across tabs to notify listeners instantly with 0 server compute.
  public publish(photoId: string, eventName: string, payload: unknown): void {
    if (!photoId || !eventName) return;
    const cleanId = photoId.trim();

    // Dispatch to local listeners
    this.dispatch(cleanId, eventName, payload);

    // Broadcast across browser tabs
    if (this.channel) {
      try {
        this.channel.postMessage({ photoId: cleanId, eventName, payload });
      } catch {}
    }
  }

  // Dispatch incoming event to all matching registered listeners
  private dispatch(photoId: string, eventName: string, payload: unknown): void {
    const key = `${photoId}:${eventName}`;
    const set = this.listeners.get(key);
    if (!set || set.size === 0) return;

    set.forEach((cb) => {
      try {
        cb(payload);
      } catch (err) {
        console.warn("[PHOTO-EVENTS] Error in event listener:", eventName, err);
      }
    });
  }
}

export const photoSse = new PhotoSseManager();
