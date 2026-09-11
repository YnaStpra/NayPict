// This module manages zero-latency cross-tab and cross-component catalog event broadcasting.

export type SyncEventType = 'album' | 'photo' | 'all';

interface SyncBroadcastPayload {
  type: SyncEventType;
  payload?: any;
  timestamp: number;
}

const BROADCAST_CHANNEL_NAME = 'naypict_catalog_sync';
let channel: BroadcastChannel | null = null;

if (typeof window !== 'undefined' && 'BroadcastChannel' in window) {
  try {
    channel = new BroadcastChannel(BROADCAST_CHANNEL_NAME);
    channel.onmessage = (event: MessageEvent<SyncBroadcastPayload>) => {
      const data = event.data;
      if (data && data.type) {
        dispatchLocalEvents(data.type, data.payload);
      }
    };
  } catch (err) {
    console.warn('[CATALOG-SYNC] BroadcastChannel initialization failed:', err);
  }
}

// Dispatch native CustomEvents on the window object for React component listeners.
function dispatchLocalEvents(type: SyncEventType, payload?: any) {
  if (typeof window === 'undefined') return;

  if (type === 'album' || type === 'all') {
    window.dispatchEvent(new CustomEvent('naypict:album-changed', { detail: payload }));
  }

  if (type === 'photo' || type === 'all') {
    window.dispatchEvent(new CustomEvent('naypict:photo-changed', { detail: payload }));
  }
}

// Publish catalog mutation event locally and broadcast across open browser tabs.
export function emitCatalogSync(type: SyncEventType, payload?: any) {
  dispatchLocalEvents(type, payload);

  if (channel) {
    try {
      channel.postMessage({
        type,
        payload,
        timestamp: Date.now(),
      });
    } catch {}
  }
}
