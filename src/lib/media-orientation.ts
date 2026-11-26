import type { CSSProperties } from "react"

export type NormalizedRotationDegrees = 0 | 90 | 180 | 270

/**
 * Normalize any rotation angle into canonical clockwise degrees: 0, 90, 180, or 270.
 */
export function normalizeRotationDegrees(rotation?: number | null): NormalizedRotationDegrees {
  const deg = ((Math.round(rotation ?? 0) % 360) + 360) % 360
  if (deg === 90 || deg === 180 || deg === 270) {
    return deg
  }
  return 0
}

/**
 * Whether a rotation swaps width and height axes (90° or 270°).
 */
export function isQuarterTurnRotation(rotation?: number | null): boolean {
  const deg = normalizeRotationDegrees(rotation)
  return deg === 90 || deg === 270
}

/**
 * Compute effective visual dimensions & height/width aspect ratio for a media item.
 * Photos rotate physically in storage, so only videos apply CSS orientation swap.
 */
export function getEffectiveMediaDimensions(media: {
  width?: number | null
  height?: number | null
  type?: string | null
  rotation?: number | null
}): { width: number; height: number; ratio: number } {
  const rawW = media.width && media.width > 0 ? media.width : 1
  const rawH = media.height && media.height > 0 ? media.height : 1
  const isVideo = Boolean(media.type?.startsWith("video/"))
  const swapped = isVideo && isQuarterTurnRotation(media.rotation)
  const width = swapped ? rawH : rawW
  const height = swapped ? rawW : rawH
  return {
    width,
    height,
    ratio: height / width,
  }
}

/**
 * Get parent + inner wrapper inline styles so any fixed/aspect-sized container cleanly displays
 * rotated media (0 | 90 | 180 | 270) using CSS container-size units for 90°/270° axis swaps.
 */
export function getRotatedMediaWrapperProps(rotation?: number | null): {
  deg: NormalizedRotationDegrees
  parentStyle?: CSSProperties
  innerStyle?: CSSProperties
} {
  const deg = normalizeRotationDegrees(rotation)
  if (deg === 0) {
    return { deg: 0 }
  }

  if (deg === 180) {
    return {
      deg: 180,
      innerStyle: {
        position: "absolute",
        inset: 0,
        width: "100%",
        height: "100%",
        transform: "rotate(180deg)",
        transformOrigin: "center center",
      },
    }
  }

  return {
    deg,
    parentStyle: {
      containerType: "size",
    },
    innerStyle: {
      position: "absolute",
      top: "50%",
      left: "50%",
      width: "100cqh",
      height: "100cqw",
      transform: `translate(-50%, -50%) rotate(${deg}deg)`,
      transformOrigin: "center center",
    },
  }
}
