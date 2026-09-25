/**
 * Video Autoplay Coordinator
 * Manages viewport-based video autoplay across gallery cards:
 * 1. Enforces maximum 4 concurrent playing videos in viewport.
 * 2. If > 4 videos in viewport, rotates playback in batches of 4 every 5 seconds.
 * 3. Immediately stops videos when scrolled out of viewport to conserve RAM, GPU decoders, and mobile data.
 * 4. Listens for page visibility change (pauses all when tab is backgrounded).
 */

type VideoCallback = {
  play: () => void
  pause: () => void
}

interface RegisteredVideo {
  photoId: string
  element: HTMLElement
  callbacks: VideoCallback
  isVisible: boolean
  distanceToCenter: number
  top: number
}

class VideoAutoplayCoordinator {
  private registry = new Map<string, RegisteredVideo>()
  private observer: IntersectionObserver | null = null
  private batchIndex = 0
  private rotationTimer: ReturnType<typeof setTimeout> | null = null
  private activeIds = new Set<string>()
  private isDocumentVisible = true
  private isPausedGlobally = false

  constructor() {
    if (typeof window !== "undefined") {
      this.initObserver()
      document.addEventListener("visibilitychange", this.handleVisibilityChange)
      const conn = (navigator as unknown as { connection?: EventTarget }).connection
      if (conn && "addEventListener" in conn) {
        conn.addEventListener("change", () => this.recalculate())
      }
    }
  }

  /**
   * Determine maximum concurrent playing videos:
   * Mobile (< 768px): 2 videos to protect mobile GPU decoders, RAM, and thermals.
   * Desktop/Tablet (>= 768px): 4 videos.
   */
  private getMaxConcurrent(): number {
    if (typeof window === "undefined") return 2
    return window.innerWidth < 768 ? 2 : 4
  }

  /**
   * Check if browser is on a constrained network (Data Saver active or 2G/3G cellular connection).
   */
  private isNetworkConstrained(): boolean {
    if (typeof navigator === "undefined") return false
    const conn = (navigator as unknown as {
      connection?: {
        saveData?: boolean
        effectiveType?: string
      }
    }).connection
    if (!conn) return false
    if (conn.saveData) return true
    if (conn.effectiveType === "slow-2g" || conn.effectiveType === "2g" || conn.effectiveType === "3g") {
      return true
    }
    return false
  }

  private initObserver() {
    if (typeof window === "undefined" || !("IntersectionObserver" in window)) return

    this.observer = new IntersectionObserver(
      (entries) => {
        let changed = false
        const vh = window.innerHeight

        entries.forEach((entry) => {
          const photoId = (entry.target as HTMLElement).dataset.photoId
          if (!photoId) return

          const registered = this.registry.get(photoId)
          if (!registered) return

          const rect = entry.boundingClientRect
          // Active viewport zone: card must have at least 35% visible within central bounds
          const isVisible = entry.isIntersecting && entry.intersectionRatio >= 0.35
          const centerY = rect.top + rect.height / 2
          const distanceToCenter = Math.abs(centerY - vh / 2)

          if (registered.isVisible !== isVisible || Math.abs(registered.distanceToCenter - distanceToCenter) > 20) {
            registered.isVisible = isVisible
            registered.distanceToCenter = distanceToCenter
            registered.top = rect.top
            changed = true
          }
        })

        if (changed) {
          this.recalculate()
        }
      },
      {
        root: null,
        rootMargin: "-10% 0px -10% 0px",
        threshold: [0, 0.35, 0.7],
      }
    )
  }

  private handleVisibilityChange = () => {
    this.isDocumentVisible = !document.hidden
    if (!this.isDocumentVisible) {
      this.stopAll()
      if (this.rotationTimer) {
        clearTimeout(this.rotationTimer)
        this.rotationTimer = null
      }
    } else {
      this.recalculate()
    }
  }

  private hoveredPhotoId: string | null = null

  /**
   * Pause all videos globally (e.g. when Lightbox or modal opens)
   */
  public setGloballyPaused(paused: boolean) {
    this.isPausedGlobally = paused
    if (paused) {
      this.hoveredPhotoId = null
      this.stopAll()
      if (this.rotationTimer) {
        clearTimeout(this.rotationTimer)
        this.rotationTimer = null
      }
    } else {
      this.recalculate()
    }
  }

  /**
   * Set or clear mouse-hovered video priority.
   * When a video is hovered, it immediately takes priority spot #1,
   * while exactly 1 background video pauses so total playing count remains <= MAX_CONCURRENT.
   */
  public setHovered(photoId: string | null) {
    if (this.hoveredPhotoId === photoId) return
    this.hoveredPhotoId = photoId
    this.recalculate()
  }

  public getHovered(): string | null {
    return this.hoveredPhotoId
  }

  /**
   * Register a photo card video element and callbacks
   */
  public register(photoId: string, element: HTMLElement, callbacks: VideoCallback) {
    element.dataset.photoId = photoId
    this.registry.set(photoId, {
      photoId,
      element,
      callbacks,
      isVisible: false,
      distanceToCenter: 99999,
      top: 99999,
    })

    if (this.observer) {
      this.observer.observe(element)
    }
  }

  /**
   * Unregister when card unmounts
   */
  public unregister(photoId: string) {
    if (this.hoveredPhotoId === photoId) {
      this.hoveredPhotoId = null
    }
    const item = this.registry.get(photoId)
    if (item) {
      if (this.activeIds.has(photoId)) {
        item.callbacks.pause()
        this.activeIds.delete(photoId)
      }
      if (this.observer) {
        this.observer.unobserve(item.element)
      }
      this.registry.delete(photoId)
      this.recalculate()
    }
  }

  /**
   * Re-evaluates visible videos, applies max-4 constraint, and coordinates batching
   */
  private recalculate() {
    if (!this.isDocumentVisible || this.isPausedGlobally || this.isNetworkConstrained()) {
      this.stopAll()
      return
    }

    // Get all currently visible video items
    const visibleItems = Array.from(this.registry.values()).filter((item) => item.isVisible)

    const hoveredItem = this.hoveredPhotoId ? this.registry.get(this.hoveredPhotoId) : null
    if (hoveredItem && !visibleItems.includes(hoveredItem)) {
      visibleItems.push(hoveredItem)
    }

    // If no videos visible, stop all and clear timer
    if (visibleItems.length === 0) {
      this.stopAll()
      if (this.rotationTimer) {
        clearTimeout(this.rotationTimer)
        this.rotationTimer = null
      }
      this.batchIndex = 0
      return
    }

    // Sort visible items by top position (natural reading flow from top to bottom)
    visibleItems.sort((a, b) => a.top - b.top)

    const MAX_CONCURRENT = this.getMaxConcurrent()

    if (visibleItems.length <= MAX_CONCURRENT) {
      // All visible items can play at once!
      if (this.rotationTimer) {
        clearTimeout(this.rotationTimer)
        this.rotationTimer = null
      }
      this.batchIndex = 0

      const newActiveSet = new Set(visibleItems.map((i) => i.photoId))
      this.applyActiveSet(newActiveSet)
      return
    }

    // More than MAX_CONCURRENT videos visible: chunk into batches of MAX_CONCURRENT
    const totalBatches = Math.ceil(visibleItems.length / MAX_CONCURRENT)
    if (this.batchIndex >= totalBatches) {
      this.batchIndex = 0
    }

    const startIdx = this.batchIndex * MAX_CONCURRENT
    const batchItems = visibleItems.slice(startIdx, startIdx + MAX_CONCURRENT)

    let finalActiveItems: RegisteredVideo[]

    if (hoveredItem) {
      // If hovered item is already in current batch, keep all batch items playing
      if (batchItems.some((i) => i.photoId === hoveredItem.photoId)) {
        finalActiveItems = batchItems
      } else {
        // Hovered item takes spot #1, exactly 1 video from the batch (the last one) is paused,
        // so total playing count remains EXACTLY MAX_CONCURRENT (e.g. 4 on desktop)!
        const otherBatchItems = batchItems.slice(0, MAX_CONCURRENT - 1)
        finalActiveItems = [hoveredItem, ...otherBatchItems]
      }
    } else {
      finalActiveItems = batchItems
    }

    const newActiveSet = new Set(finalActiveItems.map((i) => i.photoId))
    this.applyActiveSet(newActiveSet)

    // Schedule rotation to next batch after 10 seconds (paused while hovering to prevent interrupting user)
    if (this.rotationTimer) {
      clearTimeout(this.rotationTimer)
      this.rotationTimer = null
    }

    if (!this.hoveredPhotoId) {
      this.rotationTimer = setTimeout(() => {
        this.batchIndex = (this.batchIndex + 1) % totalBatches
        this.recalculate()
      }, 10000)
    }
  }

  private applyActiveSet(newActiveSet: Set<string>) {
    // Stop any video no longer active
    for (const activeId of this.activeIds) {
      if (!newActiveSet.has(activeId)) {
        const item = this.registry.get(activeId)
        if (item) item.callbacks.pause()
      }
    }

    // Start newly active videos
    for (const id of newActiveSet) {
      if (!this.activeIds.has(id)) {
        const item = this.registry.get(id)
        if (item) item.callbacks.play()
      }
    }

    this.activeIds = newActiveSet
  }

  private stopAll() {
    for (const activeId of this.activeIds) {
      const item = this.registry.get(activeId)
      if (item) item.callbacks.pause()
    }
    this.activeIds.clear()
  }
}

// Global singleton instance
export const videoCoordinator = typeof window !== "undefined"
  ? new VideoAutoplayCoordinator()
  : (null as unknown as VideoAutoplayCoordinator)
