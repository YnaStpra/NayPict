// This module exposes only public photo derivatives from a private Cloudflare R2 bucket.

const PUBLIC_PREFIXES = Object.freeze(["previews/", "thumbnails/"])
const VIDEO_EXTENSIONS = Object.freeze([".mp4", ".webm", ".mov", ".m4v", ".mkv"])
const READ_METHODS = Object.freeze(["GET", "HEAD"])
const ALLOW_METHODS = "GET, HEAD, OPTIONS"
const ALLOW_HEADERS = "Accept, If-Match, If-Modified-Since, If-None-Match, If-Unmodified-Since, Range"
const EXPOSE_HEADERS = "Content-Length, Content-Type, Content-Range, ETag, Last-Modified, Accept-Ranges"
const PUBLIC_CACHE_CONTROL = "public, max-age=31536000, immutable"

// Resolve APP_URL to one canonical HTTP origin and fail closed for invalid configuration.
function resolveAllowedOrigin(appUrl) {
  if (!appUrl) return null

  try {
    const url = new URL(appUrl)
    if (url.protocol !== "https:" && url.protocol !== "http:") return null
    return url.origin
  } catch {
    return null
  }
}

// Check if an HTTP origin belongs to NayPict or approved environments.
function isOriginAllowed(origin, allowedOrigin) {
  if (!origin) return true
  if (origin === allowedOrigin) return true
  try {
    const parsed = new URL(origin)
    const host = parsed.hostname
    if (host === "naypict.my.id" || host.endsWith(".naypict.my.id")) return true
    if (host.endsWith(".vercel.app")) return true
    if (host === "localhost" || host === "127.0.0.1") return true
  } catch {}
  return false
}

// Check if an HTTP referer belongs to NayPict or approved environments (Anti-Hotlinking).
function isRefererAllowed(referer, allowedOrigin) {
  if (!referer) return true
  try {
    const parsed = new URL(referer)
    const host = parsed.hostname.toLowerCase()
    if (allowedOrigin) {
      try {
        const allowedHost = new URL(allowedOrigin).hostname.toLowerCase()
        if (host === allowedHost) return true
      } catch {}
    }
    if (host === "naypict.my.id" || host.endsWith(".naypict.my.id")) return true
    if (host.endsWith(".vercel.app")) return true
    if (host === "localhost" || host === "127.0.0.1") return true
  } catch {}
  return false
}


// Build the CORS and defensive response headers dynamically reflecting approved request origin.
function buildBaseHeaders(allowedOrigin, requestOrigin) {
  const originHeader = (requestOrigin && isOriginAllowed(requestOrigin, allowedOrigin))
    ? requestOrigin
    : (allowedOrigin || "*")

  return new Headers({
    "Access-Control-Allow-Origin": originHeader,
    "Access-Control-Allow-Methods": ALLOW_METHODS,
    "Access-Control-Allow-Headers": ALLOW_HEADERS,
    "Access-Control-Expose-Headers": EXPOSE_HEADERS,
    "Cross-Origin-Resource-Policy": "cross-origin",
    "Vary": "Origin, Accept",
    "X-Content-Type-Options": "nosniff",
  })
}

// Return a non-cacheable plain-text error with the fixed application CORS policy.
function errorResponse(message, status, allowedOrigin, extraHeaders = {}, requestOrigin) {
  const headers = buildBaseHeaders(allowedOrigin, requestOrigin)
  headers.set("Cache-Control", "no-store")
  headers.set("Content-Type", "text/plain; charset=utf-8")

  for (const [name, value] of Object.entries(extraHeaders)) {
    headers.set(name, value)
  }

  return new Response(message, { status, headers })
}

// Decode the URL pathname into the exact R2 object key without accepting malformed escapes.
function parseObjectKey(url) {
  const encodedKey = url.pathname.replace(/^\/+/, "")

  try {
    return decodeURIComponent(encodedKey)
  } catch {
    return null
  }
}

// Check that a key is a concrete object below one of the public derivative prefixes or a public display video.
function isPublicObjectKey(key) {
  if (PUBLIC_PREFIXES.some((prefix) => key.startsWith(prefix) && key.length > prefix.length)) {
    return true
  }
  const lowerKey = key.toLowerCase()
  return VIDEO_EXTENSIONS.some((ext) => lowerKey.endsWith(ext))
}

// Permit requests without CORS context or with an approved origin.
function isRequestOriginAllowed(request, allowedOrigin) {
  const requestOrigin = request.headers.get("Origin")
  return isOriginAllowed(requestOrigin, allowedOrigin)
}

// Check whether a request asks R2 to evaluate HTTP cache preconditions.
function isConditionalRequest(request) {
  return ["If-Match", "If-Modified-Since", "If-None-Match", "If-Unmodified-Since"]
    .some((name) => request.headers.has(name))
}

// Build one canonical cache key so query parameters cannot be used to bypass edge caching.
function buildCacheRequest(requestUrl, key) {
  const url = new URL(requestUrl)
  url.pathname = `/${key.split("/").map((segment) => encodeURIComponent(segment)).join("/")}`
  url.search = ""
  url.hash = ""
  return new Request(url.toString(), { method: "GET" })
}

// Convert R2 HTTP metadata into immutable public derivative response headers.
function buildObjectHeaders(object, allowedOrigin, requestOrigin) {
  const headers = buildBaseHeaders(allowedOrigin, requestOrigin)
  object.writeHttpMetadata(headers)
  headers.set("Cache-Control", PUBLIC_CACHE_CONTROL)
  headers.set("ETag", object.httpEtag)
  headers.set("Last-Modified", object.uploaded.toUTCString())
  headers.set("Accept-Ranges", "bytes")
  if ("range" in object && object.range) {
    const start = object.range.offset ?? 0
    const sliceLength = ("length" in object.range && typeof object.range.length === "number")
      ? object.range.length
      : Math.max(0, object.size - start)
    const end = Math.max(start, start + sliceLength - 1)
    const total = object.size
    headers.set("Content-Range", `bytes ${start}-${end}/${total}`)
    headers.set("Content-Length", String(sliceLength))
  } else {
    headers.set("Content-Length", String(object.size))
  }

  if (!headers.has("Content-Type")) {
    headers.set("Content-Type", "application/octet-stream")
  }

  return headers
}

// Compare an HTTP ETag list with the stored R2 ETag, accepting weak cache validators.
function matchesEtag(headerValue, objectEtag) {
  if (!headerValue) return false
  if (headerValue.trim() === "*") return true

  const normalizedObjectEtag = objectEtag.replace(/^W\//, "")
  return headerValue.split(",")
    .map((value) => value.trim().replace(/^W\//, ""))
    .includes(normalizedObjectEtag)
}

// Evaluate HEAD request preconditions without downloading the R2 object body.
function getHeadPreconditionStatus(request, object) {
  const ifMatch = request.headers.get("If-Match")
  if (ifMatch && !matchesEtag(ifMatch, object.httpEtag)) return 412

  const ifUnmodifiedSince = request.headers.get("If-Unmodified-Since")
  if (ifUnmodifiedSince) {
    const deadline = Date.parse(ifUnmodifiedSince)
    if (!Number.isNaN(deadline) && object.uploaded.getTime() > deadline) return 412
  }

  const ifNoneMatch = request.headers.get("If-None-Match")
  if (ifNoneMatch && matchesEtag(ifNoneMatch, object.httpEtag)) return 304

  const ifModifiedSince = request.headers.get("If-Modified-Since")
  if (!ifNoneMatch && ifModifiedSince) {
    const deadline = Date.parse(ifModifiedSince)
    if (!Number.isNaN(deadline) && object.uploaded.getTime() <= deadline) return 304
  }

  return null
}

// Return a bodyless conditional response without an incorrect representation length.
function conditionalResponse(status, headers) {
  const responseHeaders = new Headers(headers)
  responseHeaders.delete("Content-Length")
  return new Response(null, { status, headers: responseHeaders })
}

// Validate and answer an exact-origin CORS preflight request.
function handleOptions(request, allowedOrigin) {
  const requestOrigin = request.headers.get("Origin")
  const requestedMethod = request.headers.get("Access-Control-Request-Method")?.toUpperCase()

  if (!requestOrigin || !requestedMethod) {
    return errorResponse("Invalid CORS preflight.", 400, allowedOrigin, {}, requestOrigin)
  }

  if (!isOriginAllowed(requestOrigin, allowedOrigin)) {
    return errorResponse("Origin not allowed.", 403, allowedOrigin, {}, requestOrigin)
  }

  if (!READ_METHODS.includes(requestedMethod)) {
    return errorResponse("Method not allowed.", 405, allowedOrigin, { Allow: ALLOW_METHODS }, requestOrigin)
  }

  const allowedHeaderNames = new Set(ALLOW_HEADERS.toLowerCase().split(", "))
  const requestedHeaders = (request.headers.get("Access-Control-Request-Headers") || "")
    .split(",")
    .map((name) => name.trim().toLowerCase())
    .filter(Boolean)

  if (requestedHeaders.some((name) => !allowedHeaderNames.has(name))) {
    return errorResponse("Request headers not allowed.", 403, allowedOrigin, {}, requestOrigin)
  }

  const headers = buildBaseHeaders(allowedOrigin, requestOrigin)
  headers.set("Access-Control-Max-Age", "86400")
  headers.set("Cache-Control", "no-store")
  return new Response(null, { status: 204, headers })
}

// Serve object metadata for HEAD while reusing a cached GET response when available.
async function serveHead(request, env, key, allowedOrigin) {
  const requestOrigin = request.headers.get("Origin")
  const cacheRequest = buildCacheRequest(request.url, key)
  const cached = await caches.default.match(cacheRequest)

  if (cached) {
    const uploaded = cached.headers.get("Last-Modified")
    const cachedObject = {
      httpEtag: cached.headers.get("ETag") || "",
      uploaded: uploaded ? new Date(uploaded) : new Date(0),
    }
    const status = getHeadPreconditionStatus(request, cachedObject)
    return status ? conditionalResponse(status, cached.headers) : new Response(null, {
      status: cached.status,
      headers: cached.headers,
    })
  }

  let object = await env.MEDIA_BUCKET.head(key)
  if (!object && env.VIDEO_BUCKET) {
    object = await env.VIDEO_BUCKET.head(key)
  }
  if (!object) return errorResponse("Not found.", 404, allowedOrigin, {}, requestOrigin)

  const headers = buildObjectHeaders(object, allowedOrigin, requestOrigin)
  const status = getHeadPreconditionStatus(request, object)
  return status ? conditionalResponse(status, headers) : new Response(null, { status: 200, headers })
}

// Stream a public derivative or video from R2 and populate the Cloudflare edge cache for plain GETs.
async function serveGet(request, env, context, key, allowedOrigin) {
  const requestOrigin = request.headers.get("Origin")
  const conditional = isConditionalRequest(request)
  const isRange = request.headers.has("range")
  const cacheRequest = buildCacheRequest(request.url, key)

  if (!conditional && !isRange) {
    const cached = await caches.default.match(cacheRequest)
    if (cached) return cached
  }

  const getOptions = {
    onlyIf: request.headers,
  }
  if (isRange) {
    getOptions.range = request.headers
  }

  let object = await env.MEDIA_BUCKET.get(key, getOptions)
  if (!object && env.VIDEO_BUCKET) {
    object = await env.VIDEO_BUCKET.get(key, getOptions)
  }

  if (!object) return errorResponse("Not found.", 404, allowedOrigin, {}, requestOrigin)

  const headers = buildObjectHeaders(object, allowedOrigin, requestOrigin)
  if (!("body" in object)) {
    return conditionalResponse(getHeadPreconditionStatus(request, object) ?? 412, headers)
  }

  const status = isRange && "range" in object && object.range ? 206 : 200
  const response = new Response(object.body, { status, headers })

  if (!conditional && !isRange && status === 200) {
    context.waitUntil(caches.default.put(cacheRequest, response.clone()))
  }

  return response
}

const mediaGateway = {
  // Validate the request and expose only preview or thumbnail objects from private R2.
  async fetch(request, env, context) {
    const allowedOrigin = resolveAllowedOrigin(env.APP_URL)
    if (!allowedOrigin) {
      return new Response("Media gateway is not configured.", {
        status: 500,
        headers: {
          "Cache-Control": "no-store",
          "Content-Type": "text/plain; charset=utf-8",
          "X-Content-Type-Options": "nosniff",
        },
      })
    }

    const key = parseObjectKey(new URL(request.url))
    if (key === null) return errorResponse("Invalid object key.", 400, allowedOrigin)

    // An allowlist makes protected and unknown prefixes indistinguishable and blocks legacy originals.
    if (!isPublicObjectKey(key)) {
      return errorResponse("Not found.", 404, allowedOrigin)
    }

    if (request.method === "OPTIONS") {
      return handleOptions(request, allowedOrigin)
    }

    if (!READ_METHODS.includes(request.method)) {
      return errorResponse("Method not allowed.", 405, allowedOrigin, { Allow: ALLOW_METHODS })
    }

    if (!isRequestOriginAllowed(request, allowedOrigin)) {
      return errorResponse("Origin not allowed.", 403, allowedOrigin)
    }

    const referer = request.headers.get("Referer")
    if (referer && !isRefererAllowed(referer, allowedOrigin)) {
      return errorResponse("Hotlinking forbidden.", 403, allowedOrigin)
    }

    if (!env.MEDIA_BUCKET) {
      return errorResponse("Media bucket is not configured.", 500, allowedOrigin)
    }

    try {
      return request.method === "HEAD"
        ? await serveHead(request, env, key, allowedOrigin)
        : await serveGet(request, env, context, key, allowedOrigin)
    } catch (error) {
      console.error("R2 media read failed.", error instanceof Error ? error.message : "Unknown error")
      return errorResponse("Media is temporarily unavailable.", 502, allowedOrigin)
    }
  },
}

export default mediaGateway
