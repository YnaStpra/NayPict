/* eslint-disable */
"use client"

import * as React from "react"
import { useCallback, useEffect, useMemo, useRef } from "react"
import { type PhotoVo } from "@/server/entity/vo/photo"
import { RotateCcw, ZoomIn, ZoomOut } from "lucide-react"

function createMotionValue(initial: number) {
  let val = initial
  return {
    get: () => val,
    set: (v: number) => {
      val = v
    },
  }
}

function useMotionValue(initial: number) {
  const ref = useRef<ReturnType<typeof createMotionValue> | null>(null)
  if (!ref.current) {
    ref.current = createMotionValue(initial)
  }
  return ref.current
}

const useIsStaticRenderer = () => false

export type GalleryImage = {
  src: string
  srcSet?: string
  alt?: string
  photoId?: string
  photoIndex?: number
}

export interface InfiniteGalleryProps {
  width?: string | number
  height?: string | number
  className?: string
  images?: GalleryImage[]
  photos?: PhotoVo[]
  onPhotoClick?: (index: number, photo?: PhotoVo) => void
  density?: number
  imageWidth?: number
  imageHeight?: number
  rounded?: number
  dragSpeed?: number
  driftAmount?: number
  friction?: number
  backgroundColor?: string
  style?: React.CSSProperties
}

function hash3(cx: number, cy: number, cz: number, salt: number) {
  let h = (cx | 0) * 0x8da6b343
  h ^= Math.imul(cy | 0, 0xd8163841)
  h ^= Math.imul(cz | 0, 0xcb1ab31f)
  h ^= salt | 0
  h ^= h >>> 16
  h = Math.imul(h, 0x7feb352d)
  h ^= h >>> 15
  h = Math.imul(h, 0x846ca68b)
  h ^= h >>> 16
  return h >>> 0
}

function mulberry32(seed: number) {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

function lerp(a: number, b: number, t: number) {
  return a + (b - a) * t
}

type Tile = {
  wx: number
  wy: number
  cx: number
  cy: number
  slot: number
  octave: number
  imgIdx: number
  photoId?: string
  src?: string
  alt?: string
  w: number
  h: number
  rot: number
  bakedScale: number
}

const PX_PER_UNIT = 6
const CELL_SIZE = 110
const MAX_RANGE = 20

const COMPONENT_DEFAULTS = {
  width: "100%",
  height: "100%",
  className: "",
  density: 10,
  imageWidth: 160,
  imageHeight: 160,
  rounded: 4,
  dragSpeed: 20,
  driftAmount: 20,
  friction: 10,
  backgroundColor: "transparent",
}

export function InfiniteGallery(props: InfiniteGalleryProps) {
  const mergedProps = { ...COMPONENT_DEFAULTS, ...props }
  const {
    width,
    height,
    className,
    images,
    photos,
    onPhotoClick,
    density,
    imageWidth,
    imageHeight,
    rounded,
    dragSpeed,
    driftAmount,
    friction,
    backgroundColor,
    style,
  } = mergedProps

  const containerRef = useRef<HTMLDivElement | null>(null)
  const sceneRef = useRef<HTMLDivElement | null>(null)
  const isStatic = useIsStaticRenderer()

  const safeImages: GalleryImage[] = useMemo(() => {
    if (photos && photos.length > 0) {
      return photos
        .map((photo, idx) => ({
          src: photo.thumbnail || photo.preview || photo.key || "",
          alt: photo.name || `Photo ${idx + 1}`,
          photoId: photo.photoId,
          photoIndex: idx,
        }))
        .filter((item) => Boolean(item.src))
    }
    if (Array.isArray(images) && images.length > 0) {
      return images.filter((item) => Boolean(item.src))
    }
    return []
  }, [photos, images])

  const safeDensity = Math.max(1, Math.min(15, Math.floor(density || 5)))
  const safeImageWidth = Math.max(8, Math.min(4000, imageWidth || 160))
  const safeImageHeight = Math.max(8, Math.min(4000, imageHeight || 160))
  const safeRounded = Math.max(0, Math.min(20, rounded ?? 4))
  const safeDragSpeed = Math.max(0.1, Math.min(5, (dragSpeed || 20) / 20))
  const safeDriftAmount = Math.max(0, Math.min(20, driftAmount ?? 8))
  const safeFriction = 1 - (Math.max(1, Math.min(20, friction ?? 10)) / 20) * 0.3

  const targetX = useMotionValue(0)
  const targetY = useMotionValue(0)
  const camX = useMotionValue(0)
  const camY = useMotionValue(0)
  const velX = useMotionValue(0)
  const velY = useMotionValue(0)

  const targetLogZoom = useMotionValue(0)
  const logZoom = useMotionValue(0)
  const velLogZoom = useMotionValue(0)

  const driftTX = useMotionValue(0)
  const driftTY = useMotionValue(0)
  const driftX = useMotionValue(0)
  const driftY = useMotionValue(0)

  // Controls auto zoom & pan drift, pausing on user interaction and reactivating after 15s idle
  const isAutoAnimatingRef = useRef(true)
  const idleTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const lastUserInteractionTimeRef = useRef<number>(0)

  const resetIdleTimer = useCallback(() => {
    isAutoAnimatingRef.current = false
    lastUserInteractionTimeRef.current = Date.now()
    if (idleTimerRef.current) {
      clearTimeout(idleTimerRef.current)
    }
    idleTimerRef.current = setTimeout(() => {
      isAutoAnimatingRef.current = true
    }, 15000)
  }, [])

  useEffect(() => {
    return () => {
      if (idleTimerRef.current) {
        clearTimeout(idleTimerRef.current)
      }
    }
  }, [])

  const subN = Math.max(1, Math.ceil(Math.sqrt(safeDensity)))
  const subSize = CELL_SIZE / subN
  const SUBCELL_INNER_PAD = 0.1
  const effectivePerCell = Math.min(safeDensity, subN * subN)

  const imagesCount = safeImages.length

  const SCALE_MIN = 0.45
  const SCALE_MAX = 1.6

  const generateCell = useMemo(() => {
    return (gx: number, gy: number, octave: number): Tile[] => {
      if (imagesCount === 0) return []

      const seed = hash3(gx, gy, octave | 0, 0x9e3779b1)
      const rand = mulberry32(seed)

      const totalSubs = subN * subN
      const subs = new Array<number>(totalSubs)
      for (let i = 0; i < totalSubs; i++) subs[i] = i
      for (let i = totalSubs - 1; i > 0; i--) {
        const j = Math.floor(rand() * (i + 1))
        const tmp = subs[i]
        subs[i] = subs[j]
        subs[j] = tmp
      }

      const tiles: Tile[] = []
      const count = Math.min(effectivePerCell, totalSubs)

      const pad = subSize * SUBCELL_INNER_PAD
      const innerRange = Math.max(0, subSize - pad * 2)

      const cellX0 = gx * CELL_SIZE
      const cellY0 = gy * CELL_SIZE

      const wWorld = safeImageWidth / PX_PER_UNIT
      const hWorld = safeImageHeight / PX_PER_UNIT

      for (let slot = 0; slot < count; slot++) {
        const subIdx = subs[slot]
        const sx = subIdx % subN
        const sy = Math.floor(subIdx / subN)

        const wx = cellX0 + sx * subSize + pad + rand() * innerRange
        const wy = cellY0 + sy * subSize + pad + rand() * innerRange

        const bakedScale = SCALE_MIN + rand() * (SCALE_MAX - SCALE_MIN)

        const imgIdx =
          imagesCount > 0
            ? Math.floor(rand() * imagesCount) % imagesCount
            : 0

        const imageItem = safeImages[imgIdx]

        tiles.push({
          wx,
          wy,
          cx: gx,
          cy: gy,
          slot,
          octave,
          imgIdx: imageItem?.photoIndex ?? imgIdx,
          photoId: imageItem?.photoId,
          src: imageItem?.src || "",
          alt: imageItem?.alt || "",
          w: wWorld,
          h: hWorld,
          rot: 0,
          bakedScale,
        })
      }

      return tiles
    }
  }, [
    safeImages,
    imagesCount,
    safeImageWidth,
    safeImageHeight,
    subN,
    subSize,
    effectivePerCell,
  ])

  useEffect(() => {
    const scene = sceneRef.current
    const container = containerRef.current
    if (!scene) return

    let cW = container ? container.clientWidth || 900 : 900
    let cH = container ? container.clientHeight || 600 : 600
    const ro = new ResizeObserver(() => {
      if (container) {
        cW = container.clientWidth || cW
        cH = container.clientHeight || cH
      }
    })
    if (container) ro.observe(container)

    const layerPools = new Map<
      number,
      {
        tileEls: Map<string, HTMLDivElement>
        imgEls: Map<string, HTMLImageElement>
      }
    >()

    const getPool = (octave: number) => {
      let pool = layerPools.get(octave)
      if (!pool) {
        pool = { tileEls: new Map(), imgEls: new Map() }
        layerPools.set(octave, pool)
      }
      return pool
    }

    // Dynamic GPU Tile Texture Memory Eviction: Explicitly disconnect textures and revoke image sources
    const disposeLayer = (octave: number) => {
      const pool = layerPools.get(octave)
      if (!pool) return
      pool.imgEls.forEach((img) => {
        img.onload = null
        img.onerror = null
        img.src = ""
      })
      pool.tileEls.forEach((el) => {
        if (el.parentNode === scene) scene.removeChild(el)
      })
      pool.tileEls.clear()
      pool.imgEls.clear()
      layerPools.delete(octave)
    }

    const removeTile = (octave: number, key: string) => {
      const pool = layerPools.get(octave)
      if (!pool) return
      const img = pool.imgEls.get(key)
      if (img) {
        img.onload = null
        img.onerror = null
        img.src = ""
      }
      const el = pool.tileEls.get(key)
      if (el && el.parentNode === scene) scene.removeChild(el)
      pool.tileEls.delete(key)
      pool.imgEls.delete(key)
    }

    const cellCache = new Map<string, Tile[]>()

    const getCachedCell = (gx: number, gy: number, octave: number): Tile[] => {
      const cacheKey = `${gx},${gy},${octave}`
      let cached = cellCache.get(cacheKey)
      if (!cached) {
        cached = generateCell(gx, gy, octave)
        if (cellCache.size > 2000) cellCache.clear()
        cellCache.set(cacheKey, cached)
      }
      return cached
    }

    const ensureTile = (t: Tile, layerZBase: number): HTMLDivElement => {
      const pool = getPool(t.octave)
      const key = `${t.cx},${t.cy},${t.slot}`
      let el = pool.tileEls.get(key)

      const currentPhotoId = t.photoId || safeImages[t.imgIdx]?.photoId || ""
      const currentSrc = t.src || safeImages[t.imgIdx]?.src || ""
      const currentPhotoIndex = safeImages[t.imgIdx]?.photoIndex ?? t.imgIdx

      if (!el) {
        const divEl = document.createElement("div")
        divEl.style.position = "absolute"
        divEl.style.left = "50%"
        divEl.style.top = "50%"
        divEl.style.transformOrigin = "0 0"
        divEl.style.willChange = "transform, opacity"
        divEl.style.pointerEvents = "auto"
        divEl.style.cursor = "pointer"
        divEl.dataset.tileKey = key
        divEl.dataset.photoId = currentPhotoId
        divEl.dataset.photoIndex = String(currentPhotoIndex)

        const wPx = t.w * PX_PER_UNIT
        const hPx = t.h * PX_PER_UNIT
        divEl.style.width = `${wPx}px`
        divEl.style.height = `${hPx}px`
        divEl.style.zIndex = String(layerZBase + Math.floor(t.bakedScale * 5))
        divEl.style.willChange = "transform, opacity"
        divEl.style.backfaceVisibility = "hidden"
        divEl.style.contain = "layout style paint"

        const img = document.createElement("img")
        img.src = currentSrc
        img.alt = t.alt || safeImages[t.imgIdx]?.alt || ""
        img.decoding = "async"
        img.loading = "eager"
        img.draggable = false
        img.style.width = "100%"
        img.style.height = "100%"
        img.style.objectFit = "cover"
        img.style.display = "block"
        img.style.pointerEvents = "none"
        img.style.userSelect = "none"
        img.style.imageRendering = "-webkit-optimize-contrast"
        img.style.transform = "translateZ(0)"
        img.style.transition = "transform 0.2s ease, box-shadow 0.2s ease"

        img.onerror = () => {
          if (img.src && !img.src.includes('/media/')) {
            const fallbackSrc = currentSrc.startsWith('http') ? currentSrc.replace(/^https?:\/\/[^\/]+/, '/media') : currentSrc
            img.src = fallbackSrc
          }
        }

        const radiusPx = (safeRounded / 20) * (Math.min(wPx, hPx) / 2)
        img.style.borderRadius = `${radiusPx}px`

        divEl.appendChild(img)

        // Click / Tap handler
        let pointerStartX = 0
        let pointerStartY = 0

        const triggerClick = (e: Event) => {
          e.stopPropagation()
          resetIdleTimer()
          const pId = divEl.dataset.photoId
          let realIndex = -1
          if (pId && photos && photos.length > 0) {
            realIndex = photos.findIndex((photo) => photo.photoId === pId)
          }
          if (realIndex === -1) {
            const idxData = Number(divEl.dataset.photoIndex)
            realIndex = !isNaN(idxData) ? idxData : t.imgIdx
          }
          const realPhoto = photos && realIndex >= 0 ? photos[realIndex] : undefined
          onPhotoClick?.(realIndex, realPhoto)
        }

        divEl.addEventListener("pointerdown", (e) => {
          pointerStartX = e.clientX
          pointerStartY = e.clientY
        })

        divEl.addEventListener("click", (e) => {
          const dx = Math.abs(e.clientX - pointerStartX)
          const dy = Math.abs(e.clientY - pointerStartY)
          if (dx < 12 && dy < 12) {
            triggerClick(e)
          }
        })

        // Hover animation
        divEl.addEventListener("pointerenter", () => {
          img.style.transform = "scale(1.06)"
          img.style.boxShadow = "0 12px 24px -6px rgba(0,0,0,0.4)"
        })
        divEl.addEventListener("pointerleave", () => {
          img.style.transform = "scale(1)"
          img.style.boxShadow = "none"
        })

        scene.appendChild(divEl)
        pool.tileEls.set(key, divEl)
        pool.imgEls.set(key, img)
        el = divEl
      } else {
        // Update photoId & src on reused tile if data changed
        if (el.dataset.photoId !== currentPhotoId) {
          el.dataset.photoId = currentPhotoId
          el.dataset.photoIndex = String(currentPhotoIndex)
          const img = pool.imgEls.get(key)
          if (img && img.src !== currentSrc) {
            img.src = currentSrc
          }
        }
      }
      return el
    }

    const projectLayer = (
      octave: number,
      layerScale: number,
      layerAlpha: number,
      layerZBase: number,
      cx: number,
      cy: number
    ) => {
      const pool = getPool(octave)

      const camCellX = Math.floor(cx / CELL_SIZE)
      const camCellY = Math.floor(cy / CELL_SIZE)

      const worldHalfX = cW / 2 / (PX_PER_UNIT * layerScale)
      const worldHalfY = cH / 2 / (PX_PER_UNIT * layerScale)
      const rangeX = Math.min(
        MAX_RANGE,
        Math.ceil(worldHalfX / CELL_SIZE) + 1
      )
      const rangeY = Math.min(
        MAX_RANGE,
        Math.ceil(worldHalfY / CELL_SIZE) + 1
      )

      const visibleKeys = new Set<string>()

      for (let dy = -rangeY; dy <= rangeY; dy++) {
        for (let dx = -rangeX; dx <= rangeX; dx++) {
          const tiles = getCachedCell(
            camCellX + dx,
            camCellY + dy,
            octave
          )
          for (let i = 0; i < tiles.length; i++) {
            const t = tiles[i]
            const dxPx = (t.wx - cx) * layerScale * PX_PER_UNIT
            const dyPx = (t.wy - cy) * layerScale * PX_PER_UNIT
            const s = t.bakedScale * layerScale
            const wPx = t.w * PX_PER_UNIT
            const hPx = t.h * PX_PER_UNIT

            // Dynamic Memory-Bounded Frustum Culling: Skip DOM allocation and transform calculation for off-screen tiles
            const marginX = cW * 0.25
            const marginY = cH * 0.25
            const tileRadius = Math.max(wPx, hPx) * s * 0.8
            if (
              dxPx + tileRadius < -cW / 2 - marginX ||
              dxPx - tileRadius > cW / 2 + marginX ||
              dyPx + tileRadius < -cH / 2 - marginY ||
              dyPx - tileRadius > cH / 2 + marginY
            ) {
              continue
            }

            const key = `${t.cx},${t.cy},${t.slot}`
            visibleKeys.add(key)
            const el = ensureTile(t, layerZBase)
            el.style.transform = `translate3d(${dxPx}px, ${dyPx}px, 0) scale(${s}) rotate(${t.rot}deg) translate(${-wPx / 2}px, ${-hPx / 2}px)`
            el.style.opacity = String(layerAlpha)
          }
        }
      }

      for (const key of Array.from(pool.tileEls.keys())) {
        if (!visibleKeys.has(key)) removeTile(octave, key)
      }
    }

    let lastOctaves: Set<number> = new Set()

    const project = () => {
      const cx = camX.get()
      const cy = camY.get()
      const lz = logZoom.get()

      const octave = Math.floor(lz)
      const frac = lz - octave

      const scaleCurrent = Math.pow(2, frac)
      const scaleNext = Math.pow(2, frac - 1)

      // Continuous Smooth Cosine S-Curve Cross-Fade: Strictly continuous C1 curve (eliminates 100% of flashbang and opacity spikes)
      const smoothFrac = 0.5 * (1 - Math.cos(frac * Math.PI))
      const alphaCurrent = 1 - smoothFrac
      const alphaNext = smoothFrac

      const zBaseCurrent = 0
      const zBaseNext = 10

      if (alphaCurrent > 0.01) {
        projectLayer(
          octave,
          scaleCurrent,
          alphaCurrent,
          zBaseCurrent,
          cx,
          cy
        )
      } else {
        disposeLayer(octave)
      }

      if (alphaNext > 0.01) {
        projectLayer(octave + 1, scaleNext, alphaNext, zBaseNext, cx, cy)
      } else {
        disposeLayer(octave + 1)
      }

      const nowOctaves = new Set<number>([octave, octave + 1])
      for (const o of Array.from(lastOctaves)) {
        if (!nowOctaves.has(o)) disposeLayer(o)
      }
      for (const o of Array.from(layerPools.keys())) {
        if (!nowOctaves.has(o)) disposeLayer(o)
      }
      lastOctaves = nowOctaves
    }

    project()
    if (isStatic) {
      ro.disconnect()
      return
    }

    let raf = 0

    const loop = () => {
      // Low-Power Throttling: Pause render iterations when tab is hidden / inactive to save 100% GPU/CPU
      if (typeof document !== "undefined" && document.hidden) {
        raf = requestAnimationFrame(loop)
        return
      }

      if (isAutoAnimatingRef.current) {
        // Continuous serene center zoom drift - ultra smooth without jumping
        targetLogZoom.set(targetLogZoom.get() + 0.0012)
      } else {
        // Auto-snap to nearest integer zoom step smoothly when user stops manual interaction
        const isRecentlyInteracting = Date.now() - lastUserInteractionTimeRef.current < 400
        if (!isRecentlyInteracting && Math.abs(velLogZoom.get()) < 0.002) {
          const roundedZoom = Math.round(targetLogZoom.get())
          if (Math.abs(targetLogZoom.get() - roundedZoom) > 0.001) {
            targetLogZoom.set(lerp(targetLogZoom.get(), roundedZoom, 0.05))
          }
        }
      }

      const tx = targetX.get() + velX.get()
      const ty = targetY.get() + velY.get()
      targetX.set(tx)
      targetY.set(ty)
      velX.set(velX.get() * safeFriction)
      velY.set(velY.get() * safeFriction)

      const vlz = velLogZoom.get()
      if (vlz !== 0) {
        targetLogZoom.set(targetLogZoom.get() + vlz)
        velLogZoom.set(vlz * safeFriction)
      }

      driftX.set(lerp(driftX.get(), driftTX.get() * safeDriftAmount, 0.08))
      driftY.set(lerp(driftY.get(), driftTY.get() * safeDriftAmount, 0.08))

      camX.set(lerp(camX.get(), targetX.get() + driftX.get(), 0.18))
      camY.set(lerp(camY.get(), targetY.get() + driftY.get(), 0.18))
      logZoom.set(lerp(logZoom.get(), targetLogZoom.get(), 0.18))

      project()
      raf = requestAnimationFrame(loop)
    }
    raf = requestAnimationFrame(loop)
    return () => {
      cancelAnimationFrame(raf)
      ro.disconnect()
      Array.from(layerPools.keys()).forEach(disposeLayer)
    }
  }, [
    generateCell,
    safeFriction,
    safeDriftAmount,
    safeRounded,
    safeImages,
    photos,
    onPhotoClick,
    isStatic,
    camX,
    camY,
    logZoom,
    targetX,
    targetY,
    targetLogZoom,
    velX,
    velY,
    velLogZoom,
    driftX,
    driftY,
    driftTX,
    driftTY,
  ])

  useEffect(() => {
    const el = containerRef.current
    if (!el || isStatic) return

    let dragging = false
    let hasCaptured = false
    let startPX = 0
    let startPY = 0
    let lastPX = 0
    let lastPY = 0
    let lastT = 0
    let pid: number | null = null

    const onDown = (e: PointerEvent) => {
      if (e.button !== 0 && e.pointerType === "mouse") return
      resetIdleTimer()
      dragging = true
      hasCaptured = false
      pid = e.pointerId
      startPX = e.clientX
      startPY = e.clientY
      lastPX = e.clientX
      lastPY = e.clientY
      lastT = e.timeStamp
    }

    const onMove = (e: PointerEvent) => {
      const rect = el.getBoundingClientRect()
      const nx = ((e.clientX - rect.left) / rect.width) * 2 - 1
      const ny = ((e.clientY - rect.top) / rect.height) * 2 - 1
      driftTX.set(Math.max(-1, Math.min(1, nx)))
      driftTY.set(Math.max(-1, Math.min(1, ny)))

      if (!dragging || e.pointerId !== pid) return

      resetIdleTimer()

      const moveDist = Math.hypot(e.clientX - startPX, e.clientY - startPY)
      if (moveDist > 4 && !hasCaptured) {
        hasCaptured = true
        try {
          el.setPointerCapture(e.pointerId)
        } catch { }
        el.style.cursor = "grabbing"
      }

      const dpx = e.clientX - lastPX
      const dpy = e.clientY - lastPY

      const lz = logZoom.get()
      const frac = lz - Math.floor(lz)
      const effScale =
        (1 - frac) * Math.pow(2, frac) + frac * Math.pow(2, frac - 1)
      const dWorldX = (-dpx / (PX_PER_UNIT * effScale)) * safeDragSpeed
      const dWorldY = (-dpy / (PX_PER_UNIT * effScale)) * safeDragSpeed
      targetX.set(targetX.get() + dWorldX)
      targetY.set(targetY.get() + dWorldY)

      const dt = Math.max(1, e.timeStamp - lastT)
      const k = 16 / dt
      velX.set(dWorldX * k)
      velY.set(dWorldY * k)

      lastPX = e.clientX
      lastPY = e.clientY
      lastT = e.timeStamp
    }

    const onUp = (e: PointerEvent) => {
      if (!dragging || e.pointerId !== pid) return
      dragging = false
      pid = null
      if (hasCaptured) {
        hasCaptured = false
        try {
          el.releasePointerCapture(e.pointerId)
        } catch { }
      }
      el.style.cursor = "grab"
    }

    const onCancel = (e: PointerEvent) => onUp(e)

    const onWheel = (e: WheelEvent) => {
      e.preventDefault()
      resetIdleTimer()
      let delta = e.deltaY
      if (e.deltaMode === 1) delta *= 16
      else if (e.deltaMode === 2) delta *= 400
      const step = -delta * 0.0015 * safeDragSpeed
      velLogZoom.set(velLogZoom.get() + step)
    }

    const onLeave = () => {
      driftTX.set(0)
      driftTY.set(0)
    }

    // Touch Pinch-to-Zoom gesture handling for Android and mobile touch screens
    let isPinching = false
    let initialPinchDist = 0
    let initialPinchZoom = 0

    const getTouchDist = (e: TouchEvent) => {
      if (e.touches.length < 2) return 0
      const dx = e.touches[0].clientX - e.touches[1].clientX
      const dy = e.touches[0].clientY - e.touches[1].clientY
      return Math.hypot(dx, dy)
    }

    const onTouchStart = (e: TouchEvent) => {
      resetIdleTimer()
      if (e.touches.length === 2) {
        isPinching = true
        dragging = false
        initialPinchDist = getTouchDist(e)
        initialPinchZoom = targetLogZoom.get()
      }
    }

    const onTouchMove = (e: TouchEvent) => {
      if (isPinching && e.touches.length === 2) {
        resetIdleTimer()
        if (e.cancelable) e.preventDefault()
        const dist = getTouchDist(e)
        if (dist > 0 && initialPinchDist > 0) {
          const scale = dist / initialPinchDist
          const logDelta = Math.log2(scale)
          targetLogZoom.set(initialPinchZoom + logDelta)
        }
      }
    }

    const onTouchEnd = (e: TouchEvent) => {
      if (e.touches.length < 2) {
        isPinching = false
      }
    }

    el.addEventListener("pointerdown", onDown)
    el.addEventListener("pointermove", onMove)
    el.addEventListener("pointerup", onUp)
    el.addEventListener("pointercancel", onCancel)
    el.addEventListener("wheel", onWheel, { passive: false })
    el.addEventListener("pointerleave", onLeave)

    el.addEventListener("touchstart", onTouchStart, { passive: true })
    el.addEventListener("touchmove", onTouchMove, { passive: false })
    el.addEventListener("touchend", onTouchEnd, { passive: true })
    el.addEventListener("touchcancel", onTouchEnd, { passive: true })

    el.style.cursor = "grab"

    return () => {
      el.removeEventListener("pointerdown", onDown)
      el.removeEventListener("pointermove", onMove)
      el.removeEventListener("pointerup", onUp)
      el.removeEventListener("pointercancel", onCancel)
      el.removeEventListener("wheel", onWheel)
      el.removeEventListener("pointerleave", onLeave)

      el.removeEventListener("touchstart", onTouchStart)
      el.removeEventListener("touchmove", onTouchMove)
      el.removeEventListener("touchend", onTouchEnd)
      el.removeEventListener("touchcancel", onTouchEnd)
    }
  }, [
    isStatic,
    safeDragSpeed,
    generateCell,
    targetX,
    targetY,
    velX,
    velY,
    velLogZoom,
    logZoom,
    targetLogZoom,
    driftTX,
    driftTY,
    resetIdleTimer,
  ])

  const resolveDim = (
    v: string | number | undefined,
    fallback: string
  ): string => {
    if (v == null) return fallback
    if (typeof v === "number") return `${v}px`
    return v
  }

  const wrapperStyle: React.CSSProperties = {
    position: "relative",
    width: resolveDim(width, "100%"),
    height: resolveDim(height, "100%"),
    minWidth: 300,
    minHeight: 400,
    overflow: "hidden",
    backgroundColor,
    touchAction: "none",
    userSelect: "none",
    cursor: "grab",
    ...style,
  }

  const sceneStyle: React.CSSProperties = {
    position: "absolute",
    inset: 0,
  }

  const handleZoomIn = () => {
    resetIdleTimer()
    targetLogZoom.set(targetLogZoom.get() + 0.6)
  }

  const handleZoomOut = () => {
    resetIdleTimer()
    targetLogZoom.set(targetLogZoom.get() - 0.6)
  }

  const handleResetZoom = () => {
    resetIdleTimer()
    targetLogZoom.set(0)
    targetX.set(0)
    targetY.set(0)
  }

  return (
    <div ref={containerRef} className={className} style={wrapperStyle} data-infinite-gallery="true">
      <div ref={sceneRef} style={sceneStyle} />
    </div>
  )
}

export default InfiniteGallery
