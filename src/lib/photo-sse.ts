// This module manages a single shared SSE connection per photo across all UI components,
// automatically closing connections on tab minimize/inactivity to preserve Vercel serverless quota.

type SseCallback = (payload: any) => void;

class PhotoSseManager {
  private activePhotoId: string | null = null;
  private sse: EventSource | null = null;
  private listeners = new Map<string, Set<SseCallback>>();
  private refCount = 0;
  private isPausedByVisibility = false;
  private inactivityTimer: NodeJS.Timeout | null = null;
  private isTabVisible = true;

  constructor() {
    if (typeof window !== "undefined") {
      this.isTabVisible = document.visibilityState === "visible";

      // Disconnect when user leaves/minimizes the tab, reconnect when returning
      document.addEventListener("visibilitychange", () => {
        const visible = document.visibilityState === "visible";
        this.isTabVisible = visible;

        if (!visible) {
          this.pause();
        } else {
          this.resume();
        }
      });

      // Reset inactivity timer on user interaction
      const resetActivity = () => {
        this.resetInactivityTimer();
      };
      window.addEventListener("pointerdown", resetActivity, { passive: true });
      window.addEventListener("keydown", resetActivity, { passive: true });
      window.addEventListener("scroll", resetActivity, { passive: true });
    }
  }

  // Subscribe a component to a specific SSE event on a photo.
  // Returns an unsubscribe function.
  public subscribe(photoId: string, eventName: string, callback: SseCallback): () => void {
    if (!photoId || typeof window === "undefined" || !("EventSource" in window)) {
      return () => {};
    }

    const cleanId = photoId.trim();

    // If switching to a different photo, tear down existing SSE stream
    if (this.activePhotoId && this.activePhotoId !== cleanId) {
      this.disconnect();
    }

    this.activePhotoId = cleanId;
    this.refCount++;

    const key = `${cleanId}:${eventName}`;
    if (!this.listeners.has(key)) {
      this.listeners.set(key, new Set());
    }
    this.listeners.get(key)!.add(callback);

    // Establish connection if not already open and tab is visible
    if (!this.sse && this.isTabVisible) {
      this.connect(cleanId);
    }

    this.resetInactivityTimer();

    return () => {
      const set = this.listeners.get(key);
      if (set) {
        set.delete(callback);
        if (set.size === 0) {
          this.listeners.delete(key);
        }
      }

      this.refCount = Math.max(0, this.refCount - 1);
      if (this.refCount === 0) {
        this.disconnect();
      }
    };
  }

  // Connect shared EventSource stream for the active photo
  private connect(photoId: string): void {
    if (typeof window === "undefined" || !("EventSource" in window)) return;
    if (this.sse) return;

    try {
      const url = `/api/photos/${encodeURIComponent(photoId)}/comments/sse`;
      const sse = new EventSource(url);
      this.sse = sse;
      this.isPausedByVisibility = false;

      // Event types to route
      const knownEvents = [
        "comment_added",
        "reply_added",
        "comment_deleted",
        "reply_deleted",
        "heart_updated",
        "pin_updated",
        "reaction_updated",
      ];

      knownEvents.forEach((eventName) => {
        sse.addEventListener(eventName, (event: MessageEvent) => {
          this.dispatch(photoId, eventName, event);
        });
      });

      sse.onerror = () => {
        // EventSource will automatically retry in background if transient error
      };
    } catch (err) {
      console.warn("[PHOTO-SSE] Failed to establish shared SSE connection:", err);
    }
  }

  // Dispath incoming event to all matching registered listeners
  private dispatch(photoId: string, eventName: string, event: MessageEvent): void {
    const key = `${photoId}:${eventName}`;
    const set = this.listeners.get(key);
    if (!set || set.size === 0) return;

    let parsedPayload: any = null;
    try {
      parsedPayload = event.data ? JSON.parse(event.data) : null;
    } catch {
      parsedPayload = event.data;
    }

    set.forEach((cb) => {
      try {
        cb(parsedPayload);
      } catch (err) {
        console.warn("[PHOTO-SSE] Error in event listener:", eventName, err);
      }
    });
  }

  // Pause connection when tab is minimized or hidden
  private pause(): void {
    if (this.sse) {
      this.sse.close();
      this.sse = null;
      this.isPausedByVisibility = true;
    }
    if (this.inactivityTimer) {
      clearTimeout(this.inactivityTimer);
      this.inactivityTimer = null;
    }
  }

  // Resume connection when tab becomes active again
  private resume(): void {
    if (this.refCount > 0 && this.activePhotoId && !this.sse) {
      this.connect(this.activePhotoId);
      this.resetInactivityTimer();
    }
  }

  // Disconnect completely and clear active photo
  private disconnect(): void {
    if (this.sse) {
      this.sse.close();
      this.sse = null;
    }
    if (this.inactivityTimer) {
      clearTimeout(this.inactivityTimer);
      this.inactivityTimer = null;
    }
    this.activePhotoId = null;
    this.refCount = 0;
  }

  // Auto-disconnect if user stays inactive on the photo for 3 minutes to save serverless CPU
  private resetInactivityTimer(): void {
    if (this.inactivityTimer) {
      clearTimeout(this.inactivityTimer);
    }

    if (this.refCount === 0 || !this.isTabVisible) return;

    // 3 minutes inactivity threshold
    this.inactivityTimer = setTimeout(() => {
      if (this.sse) {
        this.sse.close();
        this.sse = null;
      }
    }, 180_000);
  }
}

export const photoSse = new PhotoSseManager();
