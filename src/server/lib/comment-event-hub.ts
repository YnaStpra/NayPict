// This module provides an in-memory event emitter hub for real-time comment updates via Server-Sent Events (SSE).

import { type CommentVo } from '@/server/entity/vo/comment';

export type CommentEventType = 'comment_added' | 'reply_added' | 'comment_deleted' | 'reply_deleted';

export interface CommentEvent {
  type: CommentEventType;
  photoId: string;
  comment?: CommentVo;
  commentId?: string;
  timestamp: string;
}

type CommentListener = (event: CommentEvent) => void;

class CommentEventHub {
  private listeners = new Map<string, Set<CommentListener>>();

  // Subscribe to real-time comment events for a specific photo ID.
  public subscribe(photoId: string, listener: CommentListener): () => void {
    if (!this.listeners.has(photoId)) {
      this.listeners.set(photoId, new Set());
    }

    const photoListeners = this.listeners.get(photoId)!;
    photoListeners.add(listener);

    // Return unsubscribe callback
    return () => {
      photoListeners.delete(listener);
      if (photoListeners.size === 0) {
        this.listeners.delete(photoId);
      }
    };
  }

  // Publish a comment event to all active SSE subscribers for the target photo.
  public publish(photoId: string, event: Omit<CommentEvent, 'timestamp'>): void {
    const photoListeners = this.listeners.get(photoId);
    if (!photoListeners || photoListeners.size === 0) {
      return;
    }

    const payload: CommentEvent = {
      ...event,
      timestamp: new Date().toISOString(),
    };

    photoListeners.forEach((listener) => {
      try {
        listener(payload);
      } catch (err) {
        console.warn('[SSE] Error dispatching event to listener:', err);
      }
    });
  }
}

export const commentEventHub = new CommentEventHub();
