import assert from "node:assert/strict"
import { beforeEach, test } from "node:test"

// This module verifies the media gateway prefix, method, CORS, and R2 access boundaries.

import worker from "../src/index.js"

const APP_URL = "https://gallery.example.com"

// Create one R2-like object with the metadata methods used by the Worker.
function createObject(key, includeBody = true) {
  const body = new TextEncoder().encode(`asset:${key}`)
  const object = {
    key,
    size: body.byteLength,
    httpEtag: `\"etag-${key}\"`,
    uploaded: new Date("2026-01-01T00:00:00.000Z"),

    // Copy stored HTTP metadata into an outgoing response.
    writeHttpMetadata(headers) {
      headers.set("Content-Type", key.endsWith(".webp") ? "image/webp" : "image/jpeg")
    },
  }

  return includeBody ? { ...object, body } : object
}

// Create an in-memory R2 binding and record every requested key.
function createBucket() {
  const requestedKeys = []

  return {
    requestedKeys,

    // Read an object body unless the test key is explicitly missing.
    async get(key) {
      requestedKeys.push(key)
      return key.includes("missing") ? null : createObject(key)
    },

    // Read object metadata unless the test key is explicitly missing.
    async head(key) {
      requestedKeys.push(key)
      return key.includes("missing") ? null : createObject(key, false)
    },
  }
}

// Create an isolated Cache API mock for each test.
function installCacheMock() {
  const entries = new Map()

  globalThis.caches = {
    default: {
      // Return a clone so cached response bodies can be consumed repeatedly.
      async match(request) {
        return entries.get(request.url)?.clone()
      },

      // Store a clone under the canonical request URL.
      async put(request, response) {
        entries.set(request.url, response.clone())
      },
    },
  }
}

// Create an execution context that exposes pending cache writes to tests.
function createContext() {
  const pending = []

  return {
    pending,

    // Track background work in the same way Cloudflare's execution context does.
    waitUntil(promise) {
      pending.push(promise)
    },
  }
}

// Dispatch one request through the Worker with fresh mock bindings.
async function dispatch(path, options = {}) {
  const bucket = createBucket()
  const context = createContext()
  const request = new Request(`https://media.example.com${path}`, options)
  const response = await worker.fetch(request, { APP_URL, MEDIA_BUCKET: bucket }, context)
  await Promise.all(context.pending)
  return { bucket, response }
}

beforeEach(() => {
  installCacheMock()
})

test("GET serves preview and thumbnail objects with an exact CORS origin", async () => {
  for (const path of ["/previews/aa/photo.jpg", "/thumbnails/bb/photo.webp"]) {
    const { bucket, response } = await dispatch(path, {
      headers: { Origin: APP_URL },
    })

    assert.equal(response.status, 200)
    assert.equal(response.headers.get("Access-Control-Allow-Origin"), APP_URL)
    assert.notEqual(response.headers.get("Access-Control-Allow-Origin"), "*")
    assert.deepEqual(bucket.requestedKeys, [path.slice(1)])
    assert.match(await response.text(), /^asset:/)
  }
})

test("protected and unknown prefixes always return 404 without touching R2", async () => {
  for (const path of ["/photos/user/original.jpg", "/originals/user/original.jpg", "/profile/avatar.webp"]) {
    const { bucket, response } = await dispatch(path)
    assert.equal(response.status, 404)
    assert.deepEqual(bucket.requestedKeys, [])
  }
})

test("OPTIONS accepts only APP_URL and read methods", async () => {
  const allowed = await dispatch("/previews/aa/photo.jpg", {
    method: "OPTIONS",
    headers: {
      Origin: APP_URL,
      "Access-Control-Request-Method": "GET",
    },
  })
  assert.equal(allowed.response.status, 204)
  assert.equal(allowed.response.headers.get("Access-Control-Allow-Origin"), APP_URL)
  assert.notEqual(allowed.response.headers.get("Access-Control-Allow-Origin"), "*")

  const denied = await dispatch("/previews/aa/photo.jpg", {
    method: "OPTIONS",
    headers: {
      Origin: "https://evil.example",
      "Access-Control-Request-Method": "GET",
    },
  })
  assert.equal(denied.response.status, 403)

  const protectedPath = await dispatch("/originals/user/original.jpg", {
    method: "OPTIONS",
    headers: {
      Origin: APP_URL,
      "Access-Control-Request-Method": "GET",
    },
  })
  assert.equal(protectedPath.response.status, 404)
})

test("write methods return 405 and never touch R2", async () => {
  const { bucket, response } = await dispatch("/previews/aa/photo.jpg", { method: "POST" })
  assert.equal(response.status, 405)
  assert.equal(response.headers.get("Allow"), "GET, HEAD, OPTIONS")
  assert.deepEqual(bucket.requestedKeys, [])
})

test("HEAD returns thumbnail metadata without a response body", async () => {
  const { bucket, response } = await dispatch("/thumbnails/bb/photo.webp", { method: "HEAD" })
  assert.equal(response.status, 200)
  assert.equal(response.headers.get("Content-Type"), "image/webp")
  assert.equal(await response.text(), "")
  assert.deepEqual(bucket.requestedKeys, ["thumbnails/bb/photo.webp"])
})

test("a mismatched GET Origin is denied before R2 access", async () => {
  const { bucket, response } = await dispatch("/previews/aa/photo.jpg", {
    headers: { Origin: "https://evil.example" },
  })
  assert.equal(response.status, 403)
  assert.deepEqual(bucket.requestedKeys, [])
})
