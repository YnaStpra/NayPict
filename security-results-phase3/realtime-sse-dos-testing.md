# Real-Time Event Architecture & DoS Resilience — NayPict Phase 3

This document details the assessment of real-time event distribution, Server-Sent Events (SSE) attack surface, memory leak prevention, and serverless concurrency protection in NayPict.

---

## 1. Threat Model: Serverless Stream Concurrency Exhaustion

In serverless environments (e.g. Vercel Serverless Functions / AWS Lambda), long-lived HTTP streaming connections (such as traditional Server-Sent Events `text/event-stream` or WebSockets) present serious Denial-of-Service risks:
1. **Concurrency Exhaustion**: Serverless platforms enforce hard concurrency caps (e.g. 1,000 concurrent function invocations). An attacker opening 1,000 persistent SSE connections can completely block legitimate visitors from accessing the website.
2. **Execution Duration Limits**: Serverless functions automatically timeout after 10 to 60 seconds, forcing clients into aggressive reconnect loops that generate excessive billing and compute costs.
3. **Container Memory Leaks**: Holding thousands of pending streaming sockets inside shared Node.js workers causes event emitter listener leaks and garbage collector pressure.

---

## 2. Architectural Verification in NayPict

### Zero Serverless Persistent Streams
An audit of all API route handlers and server controllers reveals:
- **`text/event-stream` Endpoints**: **0**. There are no long-lived HTTP SSE endpoints exposed by the backend.
- **WebSocket Servers**: **0**. There are no persistent WebSocket gateways mounted on origin compute.

### Client-Side BroadcastChannel Distribution:
In [`src/lib/photo-sse.ts:1-65`](file:///Users/yansaputra/Naypict/src/lib/photo-sse.ts#L1-L65):
- NayPict handles real-time cross-tab synchronization entirely on the client side using the standard browser **`BroadcastChannel` API** (`"naypict_photo_events"`).
- When a user likes a photo or posts a comment in one browser tab, the event is broadcast to all other open tabs of that user **without consuming any server compute, network bandwidth, or serverless execution time**.

### Event Hub Memory Leak Protection:
In [`src/server/lib/comment-event-hub.ts:25-40`](file:///Users/yansaputra/Naypict/src/server/lib/comment-event-hub.ts#L25-L40):
- Event listener sets are tracked per `photoId`.
- The `subscribe()` method returns an explicit cleanup callback:
  ```typescript
  return () => {
    photoListeners.delete(listener);
    if (photoListeners.size === 0) {
      this.listeners.delete(photoId);
    }
  };
  ```
- When subscribers detach, the empty set is purged from the parent Map, preventing memory leaks over long-running server instances.

---

## 3. Rate Limiting & DoS Defense Summary

NayPict enforces multi-layer sliding window rate limits implemented via Upstash Redis REST API with Neon PostgreSQL database fallback:

| Endpoint / Operation | Rate Limit Threshold | Storage / Mechanism | DoS Protection Effect |
| :--- | :--- | :--- | :--- |
| `POST /api/login` | Max 5 failed attempts per 15 min per IP | Distributed Sliding Window | Mitigates credential stuffing & brute force |
| Account Lockout | Max 10 failed attempts per 15 min per username | Distributed Sliding Window | Mitigates distributed password spraying |
| `GET /photo/download/:id` | Max 30 downloads per 5 min per IP | Distributed Sliding Window | Prevents bandwidth scraping of original media |
| `POST /api/photo/comment/add` | Max 10 comments per 10 min per IP | Cloudflare Turnstile + Limiter | Prevents comment spamming |
| `POST /api/photo/reaction/add`| Max 60 reactions per min per IP | Memory / Redis Rate Limiter | Prevents micro-reaction database flooding |

---

## Conclusion
NayPict's architectural choice to offload real-time tab synchronization to the client and avoid long-lived serverless streaming connections provides complete immunity against serverless concurrency starvation attacks.
