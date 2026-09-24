import { toast } from "sonner";
import { isNetworkError, notifyConnectionLost, notifyConnectionRestored, getIsOffline } from "@/lib/network-status";
import { humanizeError } from "@/lib/error-formatter";

// This module encapsulates the front end HTTP ask.

interface ApiResponse<T = unknown> {
  code: number;
  message: string;
  data?: T | null;
}

type RequestParams = object | FormData | null;

const MOCK_REQUEST_DELAY = 0;

// Wait for specified number of milliseconds, Used to simulate online interface time consumption.
function sleep(ms: number) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

// Splicing interface base address.
function buildUrl(url: string) {
  return url.startsWith('/api') ? url : `/api${url.startsWith('/') ? url : `/${url}`}`;
}

// Handle identity failure and jump to login page.
function handleUnauthorized() {
  if (window.location.pathname !== '/login') {
    window.location.replace('/login');
  }
}

// Lightweight in-memory cache for fast idempotent GET requests (instant navigation, zero Vercel invocations)
interface CacheEntry<T> {
  data: T;
  expiresAt: number;
}

const memoryGetCache = new Map<string, CacheEntry<any>>();

const CACHEABLE_ROUTES: [RegExp, number][] = [
  [/\/photo\/list/, 60_000],            // 60s cache for photo list
  [/\/photo\/randomIdList/, 60_000],    // 60s cache for photo random IDs
  [/\/album\/list/, 60_000],            // 60s cache for album list
  [/\/photos\/map/, 120_000],           // 2m cache for map photos
  [/\/photos\/untagged/, 60_000],       // 60s cache for untagged photos
  [/\/photo\/onThisDay/, 300_000],      // 5m cache for on this day
  [/\/photo\/takenDateList/, 300_000],  // 5m cache for taken date lists
];

function getCacheTtl(url: string): number {
  for (const [pattern, ttl] of CACHEABLE_ROUTES) {
    if (pattern.test(url)) return ttl;
  }
  return 0;
}

// Invalidate in-memory cache for specified URL pattern or all entries if omitted
export function clearHttpCache(pattern?: string | RegExp) {
  if (!pattern) {
    memoryGetCache.clear();
    return;
  }
  for (const key of Array.from(memoryGetCache.keys())) {
    if (typeof pattern === 'string' ? key.includes(pattern) : pattern.test(key)) {
      memoryGetCache.delete(key);
    }
  }
}

// send POST Request and return interface data.
async function post<T = unknown>(url: string, params: RequestParams = null) {
  const headers = new Headers();
  headers.set('X-Requested-With', 'XMLHttpRequest');
  let body: BodyInit | null = null;

  if (params instanceof FormData) {
    body = params;
  } else if (params) {
    headers.set('Content-Type', 'application/json');
    body = JSON.stringify(params);
  }

  await sleep(MOCK_REQUEST_DELAY);

  let res: Response;
  try {
    res = await fetch(buildUrl(url), {
      method: 'POST',
      headers,
      body,
      credentials: 'include'
    });
  } catch (error) {
    if (isNetworkError(error)) {
      notifyConnectionLost();
      const err = new Error('Connection lost') as any;
      err.__toastShown = true;
      throw err;
    }
    const errMessage = humanizeError(error instanceof Error ? error.message : 'Network error');
    toast.error(errMessage);
    const err = new Error(errMessage) as any;
    err.__toastShown = true;
    throw err;
  }

  const text = await res.text();
  let json: ApiResponse<T> | null = null;
  try {
    json = text ? (JSON.parse(text) as ApiResponse<T>) : null;
  } catch {
    json = null;
  }

  if (!res.ok || !json || json.code !== 200) {
    if (typeof navigator !== 'undefined' && !navigator.onLine) {
      notifyConnectionLost();
      const err = new Error('Connection lost') as any;
      err.__toastShown = true;
      throw err;
    }
    const rawMessage = json?.message || (res.status === 401 ? 'auth.unauthorized' : 'Request failed');
    const message = humanizeError(rawMessage);

    if (res.status === 401 || json?.code === 401) {
      handleUnauthorized();
    }
    toast.error(message);

    const err = new Error(message) as any;
    err.__toastShown = true;
    throw err;
  }

  if (getIsOffline()) {
    notifyConnectionRestored();
  }

  // Automatically invalidate relevant in-memory GET caches on successful mutations
  if (url.includes('/photo') || url.includes('/photos')) {
    clearHttpCache('/photo');
  } else if (url.includes('/album')) {
    clearHttpCache('/album');
    clearHttpCache('/photo');
  } else {
    clearHttpCache();
  }

  return json.data as T;
}

// Append query parameters onto URL
function appendQueryParams(url: string, params?: Record<string, unknown> | null): string {
  if (!params) return url;
  const searchParams = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== null && value !== '') {
      searchParams.append(key, String(value));
    }
  }
  const queryString = searchParams.toString();
  if (!queryString) return url;
  return url.includes('?') ? `${url}&${queryString}` : `${url}?${queryString}`;
}

// In-flight Promise deduplication map to prevent redundant concurrent network round-trips for identical GET requests
const inFlightGetRequests = new Map<string, Promise<any>>();

// send GET Request and return interface data with automatic concurrent deduplication and in-memory TTL caching.
async function get<T = unknown>(url: string, params?: Record<string, unknown> | null, options?: { bypassCache?: boolean }): Promise<T> {
  const fullUrl = buildUrl(appendQueryParams(url, params));

  if (!options?.bypassCache) {
    const cached = memoryGetCache.get(fullUrl);
    if (cached && cached.expiresAt > Date.now()) {
      return cached.data as T;
    }
  }

  const existingPromise = inFlightGetRequests.get(fullUrl);
  if (existingPromise) {
    return existingPromise as Promise<T>;
  }

  const fetchPromise = (async () => {
    await sleep(MOCK_REQUEST_DELAY);

    let res: Response;
    try {
      res = await fetch(fullUrl, {
        method: 'GET',
        credentials: 'include'
      });
    } catch (error) {
      if (isNetworkError(error)) {
        notifyConnectionLost();
        const err = new Error('Connection lost') as any;
        err.__toastShown = true;
        throw err;
      }
      const errMessage = humanizeError(error instanceof Error ? error.message : 'Network error');
      toast.error(errMessage);
      const err = new Error(errMessage) as any;
      err.__toastShown = true;
      throw err;
    }

    const text = await res.text();
    let json: ApiResponse<T> | null = null;
    try {
      json = text ? (JSON.parse(text) as ApiResponse<T>) : null;
    } catch {
      json = null;
    }

    if (!res.ok || !json || json.code !== 200) {
      if (typeof navigator !== 'undefined' && !navigator.onLine) {
        notifyConnectionLost();
        const err = new Error('Connection lost') as any;
        err.__toastShown = true;
        throw err;
      }
      const rawMessage = json?.message || (res.status === 401 ? 'auth.unauthorized' : 'Request failed');
      const message = humanizeError(rawMessage);

      if (res.status === 401 || json?.code === 401) {
        handleUnauthorized();
      }
      toast.error(message);

      const err = new Error(message) as any;
      err.__toastShown = true;
      throw err;
    }

    if (getIsOffline()) {
      notifyConnectionRestored();
    }

    const ttl = getCacheTtl(fullUrl);
    if (ttl > 0 && json.code === 200 && json.data !== null && json.data !== undefined) {
      memoryGetCache.set(fullUrl, {
        data: json.data,
        expiresAt: Date.now() + ttl,
      });
    }

    return json.data as T;
  })().finally(() => {
    inFlightGetRequests.delete(fullUrl);
  });

  inFlightGetRequests.set(fullUrl, fetchPromise);
  return fetchPromise;
}

const http = {
  // send GET request.
  get<T = unknown>(url: string, params?: Record<string, unknown> | null, options?: { bypassCache?: boolean }) {
    return get<T>(url, params, options);
  },
  // send POST request.
  post<T = unknown>(url: string, params: RequestParams = null) {
    return post<T>(url, params);
  },
  clearCache: clearHttpCache,
};

export { http };
export type { ApiResponse, RequestParams };
