// This module manages real-time reaction synchronization across components, tabs, and SSE streams.

import { photoReactionsGet, photoReactionAdd } from "@/request/reaction";
import { type PhotoReactionsVo, type ReactionTotalsVo, type UserReactionsVo } from "@/server/entity/vo/reaction";
import { type ReactionType } from "@/server/entity/bo/reaction";
import { photoSse } from "@/lib/photo-sse";

type ReactionKey = "love" | "fire" | "clap" | "camera" | "place";
const ALL_KEYS: ReactionKey[] = ["love", "fire", "clap", "camera", "place"];

// Client visitor identifier resolver
export function getClientVisitorId(): string {
  if (typeof window === "undefined") return "";
  try {
    const key = "naypict_vid";
    let vid = localStorage.getItem(key);
    if (!vid) {
      vid = `v_${Date.now()}_${Math.random().toString(36).slice(2, 11)}`;
      localStorage.setItem(key, vid);
    }
    return vid;
  } catch {
    return "";
  }
}

const DEFAULT_STATE: PhotoReactionsVo = {
  photoId: "",
  totals: { love: 0, fire: 0, camera: 0, place: 0, clap: 0 },
  userReactions: { love: false, fire: false, camera: false, place: false, clap: 0 },
};

class ReactionSyncManager {
  private cache = new Map<string, PhotoReactionsVo>();
  private listeners = new Map<string, Set<(data: PhotoReactionsVo) => void>>();
  private pollTimers = new Map<string, NodeJS.Timeout>();
  private channel: BroadcastChannel | null = null;

  constructor() {
    if (typeof window !== "undefined") {
      if ("BroadcastChannel" in window) {
        try {
          this.channel = new BroadcastChannel("naypict_reactions_sync");
          this.channel.onmessage = (event) => {
            if (event.data?.photoId && event.data?.state) {
              this.setCacheAndNotify(event.data.photoId, event.data.state, false);
            }
          };
        } catch (err) {
          console.warn("[REACTION-SYNC] BroadcastChannel initialization skipped:", err);
        }
      }

      // Automatically suspend background timers when tab is hidden and re-synchronize on resume
      const handleVisibilityChange = () => {
        if (typeof document === "undefined") return;
        if (document.visibilityState === "visible") {
          this.listeners.forEach((set, id) => {
            if (set.size > 0) {
              this.fetch(id).catch(() => {});
              this.startPolling(id);
            }
          });
        } else {
          // Tab inactive/standby: completely clear all background polling timers
          this.pollTimers.forEach((timer) => clearInterval(timer));
          this.pollTimers.clear();
        }
      };

      window.addEventListener("focus", handleVisibilityChange);
      document.addEventListener("visibilitychange", handleVisibilityChange);
      document.addEventListener("freeze", () => {
        this.pollTimers.forEach((timer) => clearInterval(timer));
        this.pollTimers.clear();
      });
      document.addEventListener("resume", handleVisibilityChange);
    }
  }

  // Retrieve cached reactions for photoId if available
  public getCached(photoId: string): PhotoReactionsVo | undefined {
    return this.cache.get(photoId);
  }

  // Start adaptive polling heartbeat for an actively subscribed photo
  private startPolling(photoId: string): void {
    if (this.pollTimers.has(photoId)) return;
    if (typeof document !== "undefined" && document.visibilityState !== "visible") return;

    const timer = setInterval(() => {
      if (typeof document !== "undefined" && document.visibilityState === "visible") {
        const set = this.listeners.get(photoId);
        if (set && set.size > 0) {
          this.fetch(photoId).catch(() => {});
        } else {
          this.stopPolling(photoId);
        }
      } else {
        this.stopPolling(photoId);
      }
    }, 3500);

    this.pollTimers.set(photoId, timer);
  }

  // Stop polling heartbeat for a photo
  private stopPolling(photoId: string): void {
    const timer = this.pollTimers.get(photoId);
    if (timer) {
      clearInterval(timer);
      this.pollTimers.delete(photoId);
    }
  }

  // Check if two reaction states differ to avoid redundant re-renders
  private hasStateChanged(a?: PhotoReactionsVo, b?: PhotoReactionsVo): boolean {
    if (!a || !b) return true;
    return (
      a.totals.love !== b.totals.love ||
      a.totals.fire !== b.totals.fire ||
      a.totals.camera !== b.totals.camera ||
      a.totals.place !== b.totals.place ||
      a.totals.clap !== b.totals.clap ||
      a.userReactions.love !== b.userReactions.love ||
      a.userReactions.fire !== b.userReactions.fire ||
      a.userReactions.camera !== b.userReactions.camera ||
      a.userReactions.place !== b.userReactions.place ||
      a.userReactions.clap !== b.userReactions.clap
    );
  }

  // Subscribe a component to reaction updates for a specific photo
  public subscribe(photoId: string, listener: (data: PhotoReactionsVo) => void): () => void {
    if (!photoId) return () => {};

    if (!this.listeners.has(photoId)) {
      this.listeners.set(photoId, new Set());
    }
    const photoListeners = this.listeners.get(photoId)!;
    photoListeners.add(listener);

    // Start background polling heartbeat if this is the first listener for this photo
    if (photoListeners.size === 1) {
      this.startPolling(photoId);
    }

    // Subscribe to real-time reaction updates via shared photoSse manager
    const unsubscribeSse = photoSse.subscribe(photoId, "reaction_updated", (payload) => {
      if (payload?.photoId === photoId && payload?.totals) {
        const current = this.cache.get(photoId) || {
          photoId,
          totals: payload.totals,
          userReactions: { love: false, fire: false, camera: false, place: false, clap: 0 },
        };

        const updated: PhotoReactionsVo = {
          ...current,
          totals: payload.totals,
        };

        this.setCacheAndNotify(photoId, updated, true);
      }
    });

    // Return current cached state immediately if exists
    const cached = this.cache.get(photoId);
    if (cached) {
      listener(cached);
    } else {
      this.fetch(photoId).catch(() => {});
    }

    return () => {
      unsubscribeSse();
      const set = this.listeners.get(photoId);
      if (set) {
        set.delete(listener);
        if (set.size === 0) {
          this.listeners.delete(photoId);
          this.stopPolling(photoId);
        }
      }
    };
  }

  // Fetch reactions from backend and cache
  public async fetch(photoId: string): Promise<PhotoReactionsVo> {
    const cleanId = photoId?.trim();
    if (!cleanId) return { ...DEFAULT_STATE };

    try {
      const res = await photoReactionsGet({ photoId: cleanId, visitorId: getClientVisitorId() });
      if (res) {
        const previous = this.cache.get(cleanId);
        if (this.hasStateChanged(previous, res)) {
          this.setCacheAndNotify(cleanId, res, true);
        }
        return res;
      }
    } catch (err) {
      console.warn("[REACTION-SYNC] Failed to fetch photo reactions:", cleanId, err);
    }

    return this.cache.get(cleanId) || { ...DEFAULT_STATE, photoId: cleanId };
  }

  // Toggle emoji or like with instant optimistic store update and background API commit
  public async toggleReaction(photoId: string, type: ReactionType): Promise<PhotoReactionsVo> {
    const cleanId = photoId?.trim();
    if (!cleanId) return { ...DEFAULT_STATE };

    const current = this.cache.get(cleanId) || {
      photoId: cleanId,
      totals: { love: 0, fire: 0, camera: 0, place: 0, clap: 0 },
      userReactions: { love: false, fire: false, camera: false, place: false, clap: 0 },
    };

    const previousState = JSON.parse(JSON.stringify(current)) as PhotoReactionsVo;

    // 1. Compute optimistic state
    const optimistic: PhotoReactionsVo = JSON.parse(JSON.stringify(current));

    const isCurrentlyActive = type === "clap"
      ? optimistic.userReactions.clap > 0
      : Boolean(optimistic.userReactions[type as "love" | "fire" | "camera" | "place"]);

    const activeOtherKey = ALL_KEYS.find((k) => {
      if (k === type) return false;
      return k === "clap" ? optimistic.userReactions.clap > 0 : Boolean(optimistic.userReactions[k]);
    });

    // Clear all user reaction states
    optimistic.userReactions.love = false;
    optimistic.userReactions.fire = false;
    optimistic.userReactions.camera = false;
    optimistic.userReactions.place = false;
    optimistic.userReactions.clap = 0;

    // Decrement previous reaction if switching
    if (activeOtherKey) {
      optimistic.totals[activeOtherKey] = Math.max(0, optimistic.totals[activeOtherKey] - 1);
    }

    if (isCurrentlyActive) {
      // Toggle OFF
      optimistic.totals[type] = Math.max(0, optimistic.totals[type] - 1);
    } else {
      // Toggle ON
      if (type === "clap") {
        optimistic.userReactions.clap = 1;
      } else {
        optimistic.userReactions[type as "love" | "fire" | "camera" | "place"] = true;
      }
      optimistic.totals[type] = optimistic.totals[type] + 1;
    }

    // Immediately dispatch optimistic state to all subscribers and tabs
    this.setCacheAndNotify(cleanId, optimistic, true);

    // 2. Commit mutation to server
    try {
      const confirmed = await photoReactionAdd({
        photoId: cleanId,
        visitorId: getClientVisitorId(),
        reactionType: type,
        count: 1,
      });

      if (confirmed) {
        this.setCacheAndNotify(cleanId, confirmed, true);
        return confirmed;
      }
    } catch (err) {
      console.error("[REACTION-SYNC] Rollback reaction mutation:", cleanId, err);
      // Rollback on network failure
      this.setCacheAndNotify(cleanId, previousState, true);
    }

    return this.cache.get(cleanId) || optimistic;
  }

  // Update internal cache and notify all listeners on this tab and other tabs
  private setCacheAndNotify(photoId: string, state: PhotoReactionsVo, broadcastCrossTab = true): void {
    this.cache.set(photoId, state);

    // Notify local subscribers
    const set = this.listeners.get(photoId);
    if (set) {
      set.forEach((listener) => {
        try {
          listener(state);
        } catch (err) {
          console.warn("[REACTION-SYNC] Error notifying listener:", err);
        }
      });
    }

    // Broadcast across browser tabs
    if (broadcastCrossTab && this.channel) {
      try {
        this.channel.postMessage({ photoId, state });
      } catch {}
    }
  }
}

export const reactionSync = new ReactionSyncManager();
