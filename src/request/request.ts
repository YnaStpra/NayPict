import { toast } from "sonner";

// This module encapsulates the front end HTTP ask。

interface ApiResponse<T = unknown> {
  code: number;
  message: string;
  data?: T | null;
}

type RequestParams = object | FormData | null;

const MOCK_REQUEST_DELAY = 0;

// Wait for specified number of milliseconds，Used to simulate online interface time consumption。
function sleep(ms: number) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

// Splicing interface base address。
function buildUrl(url: string) {
  return url.startsWith('/api') ? url : `/api${url.startsWith('/') ? url : `/${url}`}`;
}

// Handle identity failure and jump to login page。
function handleUnauthorized() {
  if (window.location.pathname !== '/login') {
    window.location.replace('/login');
  }
}

// send POST Request and return interface data。
async function post<T = unknown>(url: string, params: RequestParams = null) {
  const headers = new Headers();
  let body: BodyInit | null = null;

  if (params instanceof FormData) {
    body = params;
  } else if (params) {
    headers.set('Content-Type', 'application/json');
    body = JSON.stringify(params);
  }

  await sleep(MOCK_REQUEST_DELAY);

  const res = await fetch(buildUrl(url), {
    method: 'POST',
    headers,
    body,
    credentials: 'include'
  });
  const json = await res.json() as ApiResponse<T>;

  if (!res.ok || json.code !== 200) {
    const message = json.message || 'Request failed';
    toast.error(message);

    if (res.status === 401 || json.code === 401) {
      handleUnauthorized();
    }

    throw new Error(message);
  }

  return json.data as T;
}

const http = {
  // send POST ask。
  post<T = unknown>(url: string, params: RequestParams = null) {
    return post<T>(url, params);
  }
};

export { http };
export type { ApiResponse, RequestParams };
