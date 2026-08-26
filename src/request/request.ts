import { toast } from "sonner";

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
    const errMessage = error instanceof Error ? error.message : 'Network error';
    toast.error(errMessage);
    throw new Error(errMessage);
  }

  const text = await res.text();
  let json: ApiResponse<T> | null = null;
  try {
    json = text ? (JSON.parse(text) as ApiResponse<T>) : null;
  } catch {
    json = null;
  }

  if (!res.ok || !json || json.code !== 200) {
    const message = json?.message || (res.status === 401 ? 'Unauthorized' : 'Request failed');

    if (res.status === 401 || json?.code === 401) {
      handleUnauthorized();
    }
    toast.error(message);

    throw new Error(message);
  }

  return json.data as T;
}

// send GET Request and return interface data.
async function get<T = unknown>(url: string) {
  await sleep(MOCK_REQUEST_DELAY);

  let res: Response;
  try {
    res = await fetch(buildUrl(url), {
      method: 'GET',
      credentials: 'include'
    });
  } catch (error) {
    const errMessage = error instanceof Error ? error.message : 'Network error';
    toast.error(errMessage);
    throw new Error(errMessage);
  }

  const text = await res.text();
  let json: ApiResponse<T> | null = null;
  try {
    json = text ? (JSON.parse(text) as ApiResponse<T>) : null;
  } catch {
    json = null;
  }

  if (!res.ok || !json || json.code !== 200) {
    const message = json?.message || (res.status === 401 ? 'Unauthorized' : 'Request failed');

    if (res.status === 401 || json?.code === 401) {
      handleUnauthorized();
    }
    toast.error(message);

    throw new Error(message);
  }

  return json.data as T;
}

const http = {
  // send GET request.
  get<T = unknown>(url: string) {
    return get<T>(url);
  },
  // send POST request.
  post<T = unknown>(url: string, params: RequestParams = null) {
    return post<T>(url, params);
  }
};

export { http };
export type { ApiResponse, RequestParams };
