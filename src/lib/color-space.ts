// This module provides color-space detection and HDR / Display P3 tone mapping utilities for modern wide-gamut displays.

let isP3Supported: boolean | null = null;
let isHdrSupported: boolean | null = null;

/**
 * Checks whether the user device/display supports Wide Color Gamut (Display P3).
 */
export function supportsDisplayP3(): boolean {
  if (typeof window === "undefined" || !window.matchMedia) return false;
  if (isP3Supported !== null) return isP3Supported;

  isP3Supported = window.matchMedia("(color-gamut: p3)").matches;
  return isP3Supported;
}

/**
 * Checks whether the display supports High Dynamic Range (HDR) content.
 */
export function supportsHdr(): boolean {
  if (typeof window === "undefined" || !window.matchMedia) return false;
  if (isHdrSupported !== null) return isHdrSupported;

  isHdrSupported = window.matchMedia("(dynamic-range: high)").matches;
  return isHdrSupported;
}

/**
 * Returns optimal CSS color-gamut / HDR rendering attributes for images and canvases.
 */
export function getWideColorRenderingStyles(): Record<string, string> {
  const p3 = supportsDisplayP3();
  const hdr = supportsHdr();

  if (p3 || hdr) {
    return {
      colorProfile: "display-p3",
      imageRendering: "high-quality",
    };
  }

  return {
    imageRendering: "auto",
  };
}
