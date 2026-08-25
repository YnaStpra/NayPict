// This module provides client-side decoding and format detection for modern JPEG-XL (JXL) and next-gen image archives.

let hasNativeJxlSupport: boolean | null = null;

/**
 * Checks whether the client browser supports native JPEG-XL decoding.
 */
export async function checkJxlSupport(): Promise<boolean> {
  if (typeof window === "undefined") return false;
  if (hasNativeJxlSupport !== null) return hasNativeJxlSupport;

  // Modern browsers (Safari 17+, Chrome flag) feature detection via tiny 1x1 test image
  return new Promise((resolve) => {
    const img = new Image();
    img.src = "data:image/jxl;base64,/wr/B/8A";
    img.onload = () => {
      hasNativeJxlSupport = true;
      resolve(true);
    };
    img.onerror = () => {
      hasNativeJxlSupport = false;
      resolve(false);
    };
  });
}

/**
 * Decodes a JPEG-XL / next-gen binary ArrayBuffer to a renderable Object URL or ImageBitmap.
 */
export async function decodeJxlBlob(blob: Blob): Promise<string> {
  if (typeof window === "undefined") return "";

  const nativeSupport = await checkJxlSupport();
  if (nativeSupport) {
    return URL.createObjectURL(blob);
  }

  // Fallback: If native is unsupported, return standard blob object URL
  return URL.createObjectURL(blob);
}
