// This module provides canvas-based rendering and social sharing utilities for 1080x1920 Instagram Story Cards with EXIF and QR codes.

import QRCode from "qrcode";
import { type PhotoVo } from "@/server/entity/vo/photo";
import { getPhotoDeviceParams, getPhotoShootingParams, formatPhotoLocation } from "@/lib/viewer-field";
import { formatPhotoTakenDate } from "@/lib/date";
import { toProxyMediaUrl } from "@/lib/url";

export type StoryTemplate = "minimalist" | "cinematic";

export interface StoryCardOptions {
  template: StoryTemplate;
  showTitle: boolean;
  showExif: boolean;
  showQrCode: boolean;
  showLocation: boolean;
  showDate: boolean;
  photographerName: string;
  galleryTitle: string;
  photoUrl: string;
}

const STORY_WIDTH = 1080;
const STORY_HEIGHT = 1920;

/**
 * Extract clean display URL for watermark / link text (e.g. naypict.vercel.app).
 */
function getDisplayUrl(photoUrl: string): string {
  if (!photoUrl) return "naypict.vercel.app";
  try {
    const u = new URL(photoUrl);
    return u.host || "naypict.vercel.app";
  } catch {
    return photoUrl.replace(/^https?:\/\//, "").split("/")[0] || "naypict.vercel.app";
  }
}

/**
 * Load an image from URL into an HTMLImageElement with CORS enabled.
 */
function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => resolve(img);
    img.onerror = () => {
      // If direct crossOrigin fails, retry with proxy URL if available
      const proxySrc = toProxyMediaUrl(src);
      if (proxySrc !== src) {
        const fallbackImg = new Image();
        fallbackImg.crossOrigin = "anonymous";
        fallbackImg.onload = () => resolve(fallbackImg);
        fallbackImg.onerror = (e) => reject(e);
        fallbackImg.src = proxySrc;
      } else {
        reject(new Error(`Failed to load image: ${src}`));
      }
    };
    img.src = src;
  });
}

/**
 * Draw rounded rectangle on canvas context.
 */
function drawRoundedRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  radius: number
) {
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.lineTo(x + width - radius, y);
  ctx.quadraticCurveTo(x + width, y, x + width, y + radius);
  ctx.lineTo(x + width, y + height - radius);
  ctx.quadraticCurveTo(x + width, y + height, x + width - radius, y + height);
  ctx.lineTo(x + radius, y + height);
  ctx.quadraticCurveTo(x, y + height, x, y + height - radius);
  ctx.lineTo(x, y + radius);
  ctx.quadraticCurveTo(x, y, x + radius, y);
  ctx.closePath();
}

/**
 * Generate a 1080x1920 Instagram Story Card Blob on HTML5 Canvas.
 */
export async function renderStoryCardToCanvas(
  photo: PhotoVo,
  options: StoryCardOptions,
  targetCanvas?: HTMLCanvasElement
): Promise<HTMLCanvasElement> {
  const canvas = targetCanvas || document.createElement("canvas");
  canvas.width = STORY_WIDTH;
  canvas.height = STORY_HEIGHT;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) throw new Error("Could not acquire 2D canvas context");

  // Determine main image source (prefer preview / original)
  const mainImageSrc = toProxyMediaUrl(photo.preview || photo.key || photo.thumbnail || "");
  const photoImg = await loadImage(mainImageSrc);

  // Generate QR Code if enabled
  let qrImg: HTMLImageElement | null = null;
  if (options.showQrCode && options.photoUrl) {
    try {
      const qrDataUrl = await QRCode.toDataURL(options.photoUrl, {
        width: 240,
        margin: 1,
        color: {
          dark: options.template === "minimalist" ? "#18181b" : "#ffffff",
          light: options.template === "minimalist" ? "#f4f4f5" : "#00000000",
        },
      });
      qrImg = await loadImage(qrDataUrl);
    } catch {
      qrImg = null;
    }
  }

  // Parse EXIF shooting & device info
  const deviceParams = getPhotoDeviceParams(photo.exif);
  const shootingParams = getPhotoShootingParams(photo.exif);
  const cameraName = deviceParams.find((p) => p.key === "camera")?.value;
  const lensName = deviceParams.find((p) => p.key === "lens")?.value;
  const shutter = shootingParams.find((p) => p.key === "shutter")?.value;
  const aperture = shootingParams.find((p) => p.key === "aperture")?.value;
  const focalLength = shootingParams.find((p) => p.key === "focalLength")?.value;
  const iso = shootingParams.find((p) => p.key === "iso")?.value;

  const locationText = options.showLocation
    ? formatPhotoLocation(photo.latitude, photo.longitude, photo.altitude)
    : null;

  const dateText = options.showDate && photo.takenTime
    ? formatPhotoTakenDate(photo.takenTime, "en")
    : null;

  // Render according to template
  if (options.template === "cinematic") {
    renderCinematicTemplate(ctx, photoImg, qrImg, photo, {
      cameraName,
      lensName,
      shutter,
      aperture,
      focalLength,
      iso,
      locationText,
      dateText,
      ...options,
    });
  } else {
    renderMinimalistTemplate(ctx, photoImg, qrImg, photo, {
      cameraName,
      lensName,
      shutter,
      aperture,
      focalLength,
      iso,
      locationText,
      dateText,
      ...options,
    });
  }

  return canvas;
}

interface TemplateRenderParams extends StoryCardOptions {
  cameraName?: string;
  lensName?: string;
  shutter?: string;
  aperture?: string;
  focalLength?: string;
  iso?: string;
  locationText?: string | null;
  dateText?: string | null;
}

/**
 * Template 1: Minimalist Exhibition Matte Frame
 */
function renderMinimalistTemplate(
  ctx: CanvasRenderingContext2D,
  img: HTMLImageElement,
  qrImg: HTMLImageElement | null,
  photo: PhotoVo,
  params: TemplateRenderParams
) {
  // 1. Clean Warm Cream/White background
  ctx.fillStyle = "#faf9f6";
  ctx.fillRect(0, 0, STORY_WIDTH, STORY_HEIGHT);

  // Outer thin film border
  ctx.strokeStyle = "#e4e4e7";
  ctx.lineWidth = 2;
  ctx.strokeRect(40, 40, STORY_WIDTH - 80, STORY_HEIGHT - 80);

  // 2. Header: Clean Gallery Title (Centered, Safe distance from top status bars)
  ctx.fillStyle = "#18181b";
  ctx.font = "bold 38px -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif";
  ctx.textAlign = "center";
  ctx.fillText(params.galleryTitle || "NayPict", STORY_WIDTH / 2, 160);

  // 3. Central Photo Frame
  const framePadding = 90;
  const frameWidth = STORY_WIDTH - framePadding * 2;
  const maxFrameHeight = 1080;
  const frameTop = 220;

  const imgRatio = (photo.width && photo.height) ? photo.width / photo.height : img.width / img.height;
  let targetWidth = frameWidth;
  let targetHeight = targetWidth / imgRatio;

  if (targetHeight > maxFrameHeight) {
    targetHeight = maxFrameHeight;
    targetWidth = targetHeight * imgRatio;
  }

  const photoX = (STORY_WIDTH - targetWidth) / 2;
  const photoY = frameTop + (maxFrameHeight - targetHeight) / 2;

  // Matte border with soft elevation shadow around photo
  ctx.save();
  ctx.shadowColor = "rgba(0, 0, 0, 0.09)";
  ctx.shadowBlur = 28;
  ctx.shadowOffsetY = 14;
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(photoX - 12, photoY - 12, targetWidth + 24, targetHeight + 24);
  ctx.restore();

  ctx.drawImage(img, photoX, photoY, targetWidth, targetHeight);
  ctx.strokeStyle = "rgba(0, 0, 0, 0.08)";
  ctx.lineWidth = 1;
  ctx.strokeRect(photoX, photoY, targetWidth, targetHeight);

  // 4. Bottom Typography & Info (Indented inward to align with photoX, preventing text clipping)
  const textX = Math.max(photoX, 100);
  let currentBottomY = photoY + targetHeight + 52;
  if (currentBottomY < 1390) currentBottomY = 1390;

  // Calculate safe text width to prevent collision with right-side QR code
  const maxTextWidth = qrImg ? (STORY_WIDTH - textX - 250) : (STORY_WIDTH - textX - 60);

  // Photo Title (if enabled)
  if (params.showTitle) {
    const photoTitle = photo.name?.replace(/\.[^/.]+$/, "") || "Untitled Photo";
    ctx.textAlign = "left";
    ctx.fillStyle = "#18181b";
    ctx.font = "bold 34px -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif";
    ctx.fillText(photoTitle, textX, currentBottomY, maxTextWidth);
    currentBottomY += 44;
  }

  // Photographer Signature
  if (params.photographerName) {
    ctx.textAlign = "left";
    ctx.fillStyle = "#52525b";
    ctx.font = "italic 22px Georgia, 'Times New Roman', serif";
    ctx.fillText(`Photographed by ${params.photographerName}`, textX, currentBottomY, maxTextWidth);
    currentBottomY += 42;
  }

  // EXIF Camera & Shooting Parameters
  if (params.showExif) {
    const specs = [
      params.cameraName,
      params.lensName,
      params.focalLength,
      params.aperture,
      params.shutter,
      params.iso ? `ISO ${params.iso}` : null,
    ].filter(Boolean).join("  •  ");

    if (specs) {
      ctx.textAlign = "left";
      ctx.fillStyle = "#52525b";
      ctx.font = "500 20px -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, monospace";
      ctx.fillText(specs, textX, currentBottomY + 6, maxTextWidth);
      currentBottomY += 36;
    }
  }

  // Date & Location
  if (params.dateText || params.locationText) {
    const metaLine = [params.dateText, params.locationText].filter(Boolean).join("  •  ");
    ctx.textAlign = "left";
    ctx.fillStyle = "#71717a";
    ctx.font = "18px -apple-system, BlinkMacSystemFont, sans-serif";
    ctx.fillText(metaLine, textX, currentBottomY + 6, maxTextWidth);
  }

  // 5. Right-side QR Code with CTA and Website Link
  if (qrImg) {
    const qrSize = 135;
    const qrX = STORY_WIDTH - Math.max(photoX, 100) - qrSize;
    const qrY = photoY + targetHeight + 45;
    const safeQrY = Math.max(qrY, 1375);

    // Call to Action Text above QR Code
    ctx.textAlign = "center";
    ctx.fillStyle = "#18181b";
    ctx.font = "bold 17px -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif";
    ctx.fillText("See more photos ↗", qrX + qrSize / 2, safeQrY - 14);

    // QR Code Image with Border
    ctx.drawImage(qrImg, qrX, safeQrY, qrSize, qrSize);
    ctx.strokeStyle = "#d4d4d8";
    ctx.lineWidth = 1;
    ctx.strokeRect(qrX - 4, safeQrY - 4, qrSize + 8, qrSize + 8);

    // Direct Website Link under QR Code
    const displayUrl = getDisplayUrl(params.photoUrl);
    ctx.fillStyle = "#2563eb"; // Blue link accent
    ctx.font = "bold 15px -apple-system, BlinkMacSystemFont, monospace";
    ctx.fillText(displayUrl, qrX + qrSize / 2, safeQrY + qrSize + 24);
  }
}

/**
 * Template 2: Cinematic Full-Bleed
 */
function renderCinematicTemplate(
  ctx: CanvasRenderingContext2D,
  img: HTMLImageElement,
  qrImg: HTMLImageElement | null,
  photo: PhotoVo,
  params: TemplateRenderParams
) {
  // Fill entire 9:16 background with photo (cover crop)
  const canvasRatio = STORY_WIDTH / STORY_HEIGHT;
  const imgRatio = (photo.width && photo.height) ? photo.width / photo.height : img.width / img.height;

  let renderWidth = STORY_WIDTH;
  let renderHeight = STORY_HEIGHT;
  let renderX = 0;
  let renderY = 0;

  if (imgRatio > canvasRatio) {
    // Image is wider than 9:16
    renderHeight = STORY_HEIGHT;
    renderWidth = STORY_HEIGHT * imgRatio;
    renderX = (STORY_WIDTH - renderWidth) / 2;
  } else {
    // Image is taller than 9:16
    renderWidth = STORY_WIDTH;
    renderHeight = STORY_WIDTH / imgRatio;
    renderY = (STORY_HEIGHT - renderHeight) / 2;
  }

  ctx.drawImage(img, renderX, renderY, renderWidth, renderHeight);

  // Top Dark Gradient
  const topGrad = ctx.createLinearGradient(0, 0, 0, 360);
  topGrad.addColorStop(0, "rgba(0, 0, 0, 0.85)");
  topGrad.addColorStop(0.6, "rgba(0, 0, 0, 0.4)");
  topGrad.addColorStop(1, "rgba(0, 0, 0, 0)");
  ctx.fillStyle = topGrad;
  ctx.fillRect(0, 0, STORY_WIDTH, 360);

  // Bottom Dark Gradient for Text Legibility
  const bottomGrad = ctx.createLinearGradient(0, STORY_HEIGHT - 650, 0, STORY_HEIGHT);
  bottomGrad.addColorStop(0, "rgba(0, 0, 0, 0)");
  bottomGrad.addColorStop(0.3, "rgba(0, 0, 0, 0.65)");
  bottomGrad.addColorStop(1, "rgba(0, 0, 0, 0.95)");
  ctx.fillStyle = bottomGrad;
  ctx.fillRect(0, STORY_HEIGHT - 650, STORY_WIDTH, 650);

  // Top Brand
  ctx.fillStyle = "#ffffff";
  ctx.font = "900 38px -apple-system, BlinkMacSystemFont, sans-serif";
  ctx.textAlign = "left";
  ctx.fillText(params.galleryTitle || "NAYPICT", 80, 150);

  if (params.photographerName) {
    ctx.fillStyle = "rgba(255, 255, 255, 0.75)";
    ctx.font = "22px -apple-system, BlinkMacSystemFont, sans-serif";
    ctx.fillText(`Photo by ${params.photographerName}`, 80, 190);
  }

  // Bottom Info Overlay
  let currentBottomContentY = STORY_HEIGHT - 280;
  const maxLeftWidth = qrImg ? STORY_WIDTH - 80 - 240 : STORY_WIDTH - 160;

  if (params.showTitle) {
    const photoTitle = photo.name?.replace(/\.[^/.]+$/, "") || "Untitled Photograph";
    ctx.fillStyle = "#ffffff";
    ctx.font = "bold 44px -apple-system, BlinkMacSystemFont, sans-serif";
    ctx.textAlign = "left";
    ctx.fillText(photoTitle, 80, currentBottomContentY, maxLeftWidth);
    currentBottomContentY += 46;
  } else {
    currentBottomContentY += 10;
  }

  if (params.showExif) {
    const gearRow = [params.cameraName, params.lensName].filter(Boolean).join("  •  ");
    if (gearRow) {
      ctx.fillStyle = "rgba(255, 255, 255, 0.9)";
      ctx.font = params.showTitle
        ? "24px -apple-system, BlinkMacSystemFont, sans-serif"
        : "bold 32px -apple-system, BlinkMacSystemFont, sans-serif";
      ctx.fillText(gearRow, 80, currentBottomContentY, maxLeftWidth);
      currentBottomContentY += params.showTitle ? 42 : 48;
    }

    const shootRow = [
      params.focalLength,
      params.aperture,
      params.shutter,
      params.iso ? `ISO ${params.iso}` : null,
    ].filter(Boolean).join("   ");

    if (shootRow) {
      ctx.fillStyle = "#38bdf8"; // subtle cyan glow for cinematic touch
      ctx.font = "bold 22px -apple-system, BlinkMacSystemFont, monospace";
      ctx.fillText(shootRow, 80, currentBottomContentY, maxLeftWidth);
    }
  }

  // QR Code at right corner with CTA and link
  if (qrImg) {
    const qrSize = 135;
    const qrX = STORY_WIDTH - 80 - qrSize;
    const qrY = STORY_HEIGHT - 290;

    // CTA
    ctx.textAlign = "center";
    ctx.fillStyle = "rgba(255, 255, 255, 0.9)";
    ctx.font = "bold 16px -apple-system, BlinkMacSystemFont, sans-serif";
    ctx.fillText("See more photos ↗", qrX + qrSize / 2, qrY - 12);

    // QR Image
    ctx.save();
    ctx.fillStyle = "rgba(0, 0, 0, 0.65)";
    drawRoundedRect(ctx, qrX - 8, qrY - 8, qrSize + 16, qrSize + 16, 18);
    ctx.fill();
    ctx.drawImage(qrImg, qrX, qrY, qrSize, qrSize);
    ctx.restore();

    // Link
    const displayUrl = getDisplayUrl(params.photoUrl);
    ctx.fillStyle = "#38bdf8";
    ctx.font = "bold 14px -apple-system, BlinkMacSystemFont, monospace";
    ctx.fillText(displayUrl, qrX + qrSize / 2, qrY + qrSize + 22);
  }
}

/**
 * Trigger Instagram Story or native mobile share sheet with generated Blob.
 */
export async function shareStoryImage(blob: Blob, title = "NayPict Story"): Promise<boolean> {
  const file = new File([blob], `${title.toLowerCase().replace(/\s+/g, "-")}-story.png`, {
    type: "image/png",
  });

  if (typeof navigator !== "undefined" && navigator.canShare && navigator.canShare({ files: [file] })) {
    try {
      await navigator.share({
        files: [file],
        title,
        text: "Check out this photograph on NayPict!",
      });
      return true;
    } catch (err: unknown) {
      if (err instanceof Error && err.name === "AbortError") {
        return false;
      }
    }
  }

  return false;
}

/**
 * Download generated Story Card directly.
 */
export function downloadStoryCard(blob: Blob, filename = "naypict-story.png") {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

/**
 * Copy image blob directly to clipboard.
 */
export async function copyStoryImageToClipboard(blob: Blob): Promise<boolean> {
  if (typeof navigator === "undefined" || !navigator.clipboard || !("write" in navigator.clipboard)) {
    return false;
  }

  try {
    const item = new ClipboardItem({ "image/png": blob });
    await navigator.clipboard.write([item]);
    return true;
  } catch {
    return false;
  }
}
