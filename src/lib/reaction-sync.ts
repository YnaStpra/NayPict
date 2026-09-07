// This module manages real-time reaction synchronization across components, tabs, and SSE streams.

import { photoReactionsGet, photoReactionAdd } from "@/request/reaction";
import { type PhotoReactionsVo, type ReactionTotalsVo, type UserReactionsVo } from "@/server/entity/vo/reaction";
import { type ReactionType } from "@/server/entity/bo/reaction";

type EmojiReactionKey = "love" | "fire" | "camera" | "place";
const EMOJI_KEYS: EmojiReactionKey[] = ["love", "fire", "camera", "place"];

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
  private channel: BroadcastChannel | null = null;
  private activeSsePhotoId: string | null = null;
  private sseSource: EventSource | null = null;
  private sseRefCount = new Map<string, number>();

  constructor() {
    if (typeof window !== "undefined" && "BroadcastChannel" in window) {
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
  }

  // Retrieve cached reactions for photoId if available
  public getCached(photoId: string): PhotoReactionsVo | undefined {
    return this.cache.get(photoId);
  }

  // Subscribe a component to reaction updates for a specific photo
  public subscribe(photoId: string, listener: (data: PhotoReactionsVo) => void): () => void {
    if (!photoId) return () => {};

    if (!this.listeners.has(photoId)) {
      this.listeners.set(photoId, new Set());
    }
    this.listeners.get(photoId)!.add(listener);

    // Track active SSE reference count
    const ref = (this.sseRefCount.get(photoId) || 0) + 1;
    this.sseRefCount.set(photoId, ref);
    this.connectSse(photoId);

    // Return current cached state immediately if exists
    const cached = this.cache.get(photoId);
    if (cached) {
      listener(cached);
    } else {
      this.fetch(photoId).catch(() => {});
    }

    return () => {
      const set = this.listeners.get(photoId);
      if (set) {
        set.delete(listener);
        if (set.size === 0) {
          this.listeners.delete(photoId);
        }
      }

      const updatedRef = Math.max(0, (this.sseRefCount.get(photoId) || 1) - 1);
      if (updatedRef === 0) {
        this.sseRefCount.delete(photoId);
        this.disconnectSse(photoId);
      } else {
        this.sseRefCount.set(photoId, updatedRef);
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
        this.setCacheAndNotify(cleanId, res, true);
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

    if (type === "clap") {
      const isCurrentlyLiked = optimistic.userReactions.clap > 0;
      optimistic.userReactions.clap = isCurrentlyLiked ? 0 : 1;
      optimistic.totals.clap = Math.max(0, optimistic.totals.clap + (isCurrentlyLiked ? -1 : 1));
    } else {
      const emojiType = type as EmojiReactionKey;
      const isCurrentlyActive = Boolean(optimistic.userReactions[emojiType]);
      const activeOtherEmoji = EMOJI_KEYS.find(
        (k) => k !== emojiType && Boolean(optimistic.userReactions[k])
      );

      EMOJI_KEYS.forEach((k) => {
        optimistic.userReactions[k] = false;
      });

      if (!isCurrentlyActive) {
        optimistic.userReactions[emojiType] = true;
      }

      if (activeOtherEmoji) {
        optimistic.totals[activeOtherEmoji] = Math.max(0, optimistic.totals[activeOtherEmoji] - 1);
      }

      if (isCurrentlyActive) {
        optimistic.totals[emojiType] = Math.max(0, optimistic.totals[emojiType] - 1);
      } else {
        optimistic.totals[emojiType] = optimistic.totals[emojiType] + 1;
      }
    }

    // Immediately dispatch optimistic state to all subscribers and tabs
    this.setCacheAndNotify(cleanId, optimistic, true);

    // 2. Commit mutation to server
    try {
      const confirmed = await photoReactionAdd({
        photoId: cleanId,
        visitorId: getClientVisitorId(),
        reactionType: type,
        count: type === "clap" ? 1 : undefined,
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

  // Connect shared SSE connection to receive live reaction updates from other visitors
  private connectSse(photoId: string): void {
    if (typeof window === "undefined" || !("EventSource" in window)) return;
    if (this.activeSsePhotoId === photoId && this.sseSource) return;

    // Disconnect existing if switching active photo
    if (this.sseSource) {
      this.sseSource.close();
      this.sseSource = null;
    }

    this.activeSsePhotoId = photoId;

    try {
      const sse = new EventSource(`/api/photos/${encodeURIComponent(photoId)}/comments/sse`);
      this.sseSource = sse;

      sse.addEventListener("reaction_updated", (event: MessageEvent) => {
        try {
          const payload = JSON.parse(event.data);
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
        } catch (err) {
          console.warn("[REACTION-SYNC] Error parsing SSE reaction event:", err);
        }
      });

      sse.onerror = () => {
        // Silently handle SSE disconnects; EventSource automatically retries
      };
    } catch {}
  }

  // Disconnect SSE when photo is no longer viewed
  private disconnectSse(photoId: string): void {
    if (this.activeSsePhotoId === photoId && this.sseSource) {
      this.sseSource.close();
      this.sseSource = null;
      this.activeSsePhotoId = null;
    }
  }
}

export const reactionSync = new ReactionSyncManager();
