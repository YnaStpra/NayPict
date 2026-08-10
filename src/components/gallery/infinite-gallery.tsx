"use client"

import * as React from "react"
import { useEffect, useMemo, useRef } from "react"
import { useLocale } from "next-intl"
import { type PhotoVo } from "@/server/entity/vo/photo"
import { formatPhotoTakenDate } from "@/lib/date"
import { PhotoFavoriteEnum } from "@/server/enums/photo-enum"

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

function formatPhotoName(name: string) {
  const index = name.lastIndexOf(".")
  return index > 0 ? name.slice(0, index) : name
}

function formatPhotoSize(size?: number) {
  if (!size) return ""
  if (size < 1024) return `${size}B`
  if (size < 1024 * 1024) return `${Math.round(size / 1024)}KB`
  return `${(size / 1024 / 1024).toFixed(1)}MB`
}

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
  onPhotoFavorite?: (index: number, setFavorite: (favorite: boolean) => void) => void
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

const DEFAULT_IMAGES: GalleryImage[] = [
  {
    src: "https://imagedelivery.net/IEUjvl3YUlxY-MrTpOAWDQ/612d1402-0ad9-4135-3bbc-a30a6a252b00/w=800",
    alt: "Photo 1",
  },
  {
    src: "https://imagedelivery.net/IEUjvl3YUlxY-MrTpOAWDQ/6d2ad64a-102d-4eab-0efe-31479e34b500/w=800",
    alt: "Photo 2",
  },
  {
    src: "https://imagedelivery.net/IEUjvl3YUlxY-MrTpOAWDQ/be854dd1-37aa-4fc7-f569-fdb948109300/w=800",
    alt: "Photo 3",
  },
  {
    src: "https://imagedelivery.net/IEUjvl3YUlxY-MrTpOAWDQ/51984031-9176-484b-f5e0-4af9a8e9ed00/w=800",
    alt: "Photo 4",
  },
  {
    src: "https://imagedelivery.net/IEUjvl3YUlxY-MrTpOAWDQ/34ce1842-4b7a-4d52-0302-38582c341700/w=800",
    alt: "Photo 5",
  },
  {
    src: "https://imagedelivery.net/IEUjvl3YUlxY-MrTpOAWDQ/88369c6d-00cc-4ac9-74ca-0f0965e06300/w=800",
    alt: "Photo 6",
  },
  {
    src: "https://imagedelivery.net/IEUjvl3YUlxY-MrTpOAWDQ/aeaa0756-9647-4f6c-d900-204bd25e4a00/w=800",
    alt: "Photo 7",
  },
  {
    src: "https://imagedelivery.net/IEUjvl3YUlxY-MrTpOAWDQ/316d1761-fd79-4ca9-b8d4-f2bb20521a00/w=800",
    alt: "Photo 8",
  },
]

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
  density: 5,
  imageWidth: 180,
  imageHeight: 180,
  rounded: 4,
  dragSpeed: 20,
  driftAmount: 20,
  friction: 10,
  backgroundColor: "transparent",
}

export function InfiniteGallery(props: InfiniteGalleryProps) {
  const locale = useLocale()
  const mergedProps = { ...COMPONENT_DEFAULTS, ...props }
  const {
    width,
    height,
    className,
    images,
    photos,
    onPhotoClick,
    onPhotoFavorite,
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
      return photos.map((photo, idx) => ({
        src: photo.thumbnail || photo.preview || photo.key || "",
        alt: photo.name || `Photo ${idx + 1}`,
        photoId: photo.photoId,
        photoIndex: idx,
      }))
    }
    if (Array.isArray(images) && images.length > 0) {
      return images
    }
    return DEFAULT_IMAGES
  }, [photos, images])

  const safeDensity = Math.max(1, Math.min(15, Math.floor(density || 5)))
  const safeImageWidth = Math.max(8, Math.min(4000, imageWidth || 180))
  const safeImageHeight = Math.max(8, Math.min(4000, imageHeight || 180))
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

  const subN = Math.max(1, Math.ceil(Math.sqrt(safeDensity)))
  const subSize = CELL_SIZE / subN
  const SUBCELL_INNER_PAD = 0.1
  const effectivePerCell = Math.min(safeDensity, subN * subN)

  const imagesCount = safeImages.length

  const SCALE_MIN = 0.45
  const SCALE_MAX = 1.6

  const generateCell = useMemo(() => {
    return (gx: number, gy: number, octave: number): Tile[] => {
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

        tiles.push({
          wx,
          wy,
          cx: gx,
          cy: gy,
          slot,
          octave,
          imgIdx,
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

    const disposeLayer = (octave: number) => {
      const pool = layerPools.get(octave)
      if (!pool) return
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
      const el = pool.tileEls.get(key)
      if (el && el.parentNode === scene) scene.removeChild(el)
      pool.tileEls.delete(key)
      pool.imgEls.delete(key)
    }

    const ensureTile = (t: Tile): HTMLDivElement => {
      const pool = getPool(t.octave)
      const key = `${t.cx},${t.cy},${t.slot}`
      let el = pool.tileEls.get(key)
      if (!el) {
        const imageItem = safeImages[t.imgIdx]
        const realIndex = imageItem?.photoIndex ?? t.imgIdx
        const photoVo = photos ? photos[realIndex] : undefined

        el = document.createElement("div")
        el.style.position = "absolute"
        el.style.left = "50%"
        el.style.top = "50%"
        el.style.transformOrigin = "0 0"
        el.style.willChange = "transform, opacity"
        el.style.pointerEvents = "auto"
        el.style.cursor = "pointer"
        el.style.overflow = "hidden"
        el.className = "group rounded-xl shadow-md transition-all duration-300 hover:shadow-2xl"
        el.dataset.tileKey = key

        const img = document.createElement("img")
        img.src = imageItem?.src || ""
        if (imageItem?.srcSet) img.srcset = imageItem.srcSet
        img.alt = imageItem?.alt || ""
        img.draggable = false
        img.style.width = "100%"
        img.style.height = "100%"
        img.style.objectFit = "cover"
        img.style.display = "block"
        img.style.pointerEvents = "none"
        img.style.userSelect = "none"
        img.style.transition = "transform 0.3s ease"
        img.className = "group-hover:scale-105"
        el.appendChild(img)

        // Photo Information Overlay (Shown on Hover / Tap)
        if (photoVo) {
          const overlay = document.createElement("div")
          overlay.className = "pointer-events-none absolute inset-0 bg-gradient-to-t from-black/85 via-black/30 to-transparent opacity-0 transition-opacity duration-300 group-hover:opacity-100 flex flex-col justify-end p-2.5 text-white"

          const nameEl = document.createElement("div")
          nameEl.className = "truncate text-xs font-semibold leading-snug drop-shadow"
          nameEl.textContent = formatPhotoName(photoVo.name)
          overlay.appendChild(nameEl)

          const dateStr = formatPhotoTakenDate(photoVo.takenTime, locale)
          if (dateStr) {
            const dateEl = document.createElement("div")
            dateEl.className = "text-[10px] text-white/80"
            dateEl.textContent = dateStr
            overlay.appendChild(dateEl)
          }

          if (photoVo.width && photoVo.height) {
            const detailsEl = document.createElement("div")
            detailsEl.className = "text-[9px] text-white/70 mt-0.5 flex items-center gap-1"
            const sizeStr = formatPhotoSize(photoVo.size)
            detailsEl.textContent = `${photoVo.typeDesc ? `${photoVo.typeDesc.toUpperCase()} • ` : ""}${photoVo.width}×${photoVo.height}${sizeStr ? ` • ${sizeStr}` : ""}`
            overlay.appendChild(detailsEl)
          }

          // Favorite Badge if favorited
          if (photoVo.favorite === PhotoFavoriteEnum.YES) {
            const favBadge = document.createElement("div")
            favBadge.className = "absolute top-2 right-2 flex size-5 items-center justify-center rounded-full bg-pink-500/80 text-white"
            favBadge.innerHTML = `<svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor" stroke="none"><path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z"/></svg>`
            el.appendChild(favBadge)
          }

          el.appendChild(overlay)
        }

        // Click handler with drag distinction
        let pointerStartX = 0
        let pointerStartY = 0
        el.addEventListener("pointerdown", (e) => {
          pointerStartX = e.clientX
          pointerStartY = e.clientY
        })
        el.addEventListener("click", (e) => {
          const dx = Math.abs(e.clientX - pointerStartX)
          const dy = Math.abs(e.clientY - pointerStartY)
          if (dx < 8 && dy < 8) {
            e.stopPropagation()
            onPhotoClick?.(realIndex, photoVo)
          }
        })

        scene.appendChild(el)
        pool.tileEls.set(key, el)
        pool.imgEls.set(key, img)
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
      const tilesThisFrame: Tile[] = []

      for (let dy = -rangeY; dy <= rangeY; dy++) {
        for (let dx = -rangeX; dx <= rangeX; dx++) {
          const tiles = generateCell(
            camCellX + dx,
            camCellY + dy,
            octave
          )
          for (let i = 0; i < tiles.length; i++) {
            tilesThisFrame.push(tiles[i])
          }
        }
      }

      const orderKeys: string[] = new Array(tilesThisFrame.length)
      const orderScale: number[] = new Array(tilesThisFrame.length)

      for (let i = 0; i < tilesThisFrame.length; i++) {
        const t = tilesThisFrame[i]
        const key = `${t.cx},${t.cy},${t.slot}`
        visibleKeys.add(key)

        const dxPx = (t.wx - cx) * layerScale * PX_PER_UNIT
        const dyPx = (t.wy - cy) * layerScale * PX_PER_UNIT
        const s = t.bakedScale * layerScale

        const el = ensureTile(t)
        const img = pool.imgEls.get(key)

        const wPx = t.w * PX_PER_UNIT
        const hPx = t.h * PX_PER_UNIT

        el.style.transform = `translate3d(${dxPx}px, ${dyPx}px, 0) scale(${s}) rotate(${t.rot}deg) translate(${-wPx / 2}px, ${-hPx / 2}px)`
        el.style.width = `${wPx}px`
        el.style.height = `${hPx}px`
        el.style.opacity = String(layerAlpha)

        if (img) {
          const radiusPx = (safeRounded / 20) * (Math.min(wPx, hPx) / 2)
          img.style.borderRadius = `${radiusPx}px`
        }

        orderKeys[i] = key
        orderScale[i] = t.bakedScale
      }

      for (const key of Array.from(pool.tileEls.keys())) {
        if (!visibleKeys.has(key)) removeTile(octave, key)
      }

      const idxs = orderKeys.map((_, i) => i)
      idxs.sort((a, b) => orderScale[a] - orderScale[b])
      for (let k = 0; k < idxs.length; k++) {
        const el = pool.tileEls.get(orderKeys[idxs[k]])
        if (el) el.style.zIndex = String(layerZBase + k)
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

      const alphaCurrent = 1 - frac
      const alphaNext = frac

      const zBaseCurrent = 0
      const zBaseNext = 100000

      projectLayer(
        octave,
        scaleCurrent,
        alphaCurrent,
        zBaseCurrent,
        cx,
        cy
      )
      projectLayer(octave + 1, scaleNext, alphaNext, zBaseNext, cx, cy)

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
    onPhotoFavorite,
    locale,
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
    let lastPX = 0
    let lastPY = 0
    let lastT = 0
    let pid: number | null = null

    const onDown = (e: PointerEvent) => {
      if (e.button !== 0 && e.pointerType === "mouse") return
      dragging = true
      pid = e.pointerId
      lastPX = e.clientX
      lastPY = e.clientY
      lastT = e.timeStamp
      try {
        el.setPointerCapture(e.pointerId)
      } catch {}
      el.style.cursor = "grabbing"
    }

    const onMove = (e: PointerEvent) => {
      const rect = el.getBoundingClientRect()
      const nx = ((e.clientX - rect.left) / rect.width) * 2 - 1
      const ny = ((e.clientY - rect.top) / rect.height) * 2 - 1
      driftTX.set(Math.max(-1, Math.min(1, nx)))
      driftTY.set(Math.max(-1, Math.min(1, ny)))

      if (!dragging || e.pointerId !== pid) return

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
      try {
        el.releasePointerCapture(e.pointerId)
      } catch {}
      el.style.cursor = "grab"
    }

    const onCancel = (e: PointerEvent) => onUp(e)

    const onWheel = (e: WheelEvent) => {
      e.preventDefault()
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

    el.addEventListener("pointerdown", onDown)
    el.addEventListener("pointermove", onMove)
    el.addEventListener("pointerup", onUp)
    el.addEventListener("pointercancel", onCancel)
    el.addEventListener("wheel", onWheel, { passive: false })
    el.addEventListener("pointerleave", onLeave)

    el.style.cursor = "grab"

    return () => {
      el.removeEventListener("pointerdown", onDown)
      el.removeEventListener("pointermove", onMove)
      el.removeEventListener("pointerup", onUp)
      el.removeEventListener("pointercancel", onCancel)
      el.removeEventListener("wheel", onWheel)
      el.removeEventListener("pointerleave", onLeave)
    }
  }, [
    isStatic,
    safeDragSpeed,
    targetX,
    targetY,
    velX,
    velY,
    velLogZoom,
    logZoom,
    driftTX,
    driftTY,
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

  return (
    <div ref={containerRef} className={className} style={wrapperStyle}>
      <div ref={sceneRef} style={sceneStyle} />
    </div>
  )
}

export default InfiniteGallery
