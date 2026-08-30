// This module provides canvas-based rendering and social sharing utilities for 1080x1920 Instagram Story Cards with EXIF and QR codes.

import QRCode from "qrcode";
import { type PhotoVo } from "@/server/entity/vo/photo";
import { getPhotoDeviceParams, getPhotoShootingParams, formatPhotoLocation } from "@/lib/viewer-field";
import { formatPhotoTakenDate } from "@/lib/date";
import { toProxyMediaUrl } from "@/lib/url";

export type StoryTemplate = "glassmorphic" | "minimalist" | "cinematic";

export interface StoryCardOptions {
  template: StoryTemplate;
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
  if (options.template === "glassmorphic") {
    renderGlassmorphicTemplate(ctx, photoImg, qrImg, photo, {
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
  } else if (options.template === "minimalist") {
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
  } else {
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
 * Template 1: Modern Glassmorphic Dark Ambient
 */
function renderGlassmorphicTemplate(
  ctx: CanvasRenderingContext2D,
  img: HTMLImageElement,
  qrImg: HTMLImageElement | null,
  photo: PhotoVo,
  params: TemplateRenderParams
) {
  // 1. Draw blurred ambient backdrop from image
  ctx.save();
  ctx.filter = "blur(40px) brightness(0.4) saturate(1.4)";
  ctx.drawImage(img, -60, -60, STORY_WIDTH + 120, STORY_HEIGHT + 120);
  ctx.restore();

  // Dark gradient vignette overlay
  const bgGrad = ctx.createLinearGradient(0, 0, 0, STORY_HEIGHT);
  bgGrad.addColorStop(0, "rgba(9, 9, 11, 0.7)");
  bgGrad.addColorStop(0.5, "rgba(9, 9, 11, 0.4)");
  bgGrad.addColorStop(1, "rgba(9, 9, 11, 0.9)");
  ctx.fillStyle = bgGrad;
  ctx.fillRect(0, 0, STORY_WIDTH, STORY_HEIGHT);

  // 2. Top Header: Branding & Gallery Name
  ctx.fillStyle = "#ffffff";
  ctx.font = "bold 38px -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif";
  ctx.textAlign = "left";
  ctx.fillText(params.galleryTitle || "NayPict", 80, 140);

  ctx.fillStyle = "rgba(255, 255, 255, 0.6)";
  ctx.font = "24px -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif";
  ctx.fillText(
    params.photographerName ? `By ${params.photographerName}` : "Curated Photography",
    80,
    180
  );

  // Top Right: Live Date badge
  if (params.dateText) {
    ctx.textAlign = "right";
    ctx.fillStyle = "rgba(255, 255, 255, 0.75)";
    ctx.font = "22px -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif";
    ctx.fillText(params.dateText, STORY_WIDTH - 80, 140);
    if (params.locationText) {
      ctx.fillStyle = "rgba(255, 255, 255, 0.5)";
      ctx.font = "18px -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif";
      ctx.fillText(params.locationText, STORY_WIDTH - 80, 175);
    }
  }

  // 3. Central Photo Frame with Soft Glow & Drop Shadow
  const framePadding = 80;
  const frameWidth = STORY_WIDTH - framePadding * 2; // 920px
  const maxFrameHeight = 1100;
  const frameTop = 220;

  // Calculate photo aspect ratio fitting inside max dimensions
  const imgRatio = (photo.width && photo.height) ? photo.width / photo.height : img.width / img.height;
  let targetWidth = frameWidth;
  let targetHeight = targetWidth / imgRatio;

  if (targetHeight > maxFrameHeight) {
    targetHeight = maxFrameHeight;
    targetWidth = targetHeight * imgRatio;
  }

  const photoX = (STORY_WIDTH - targetWidth) / 2;
  const photoY = frameTop + (maxFrameHeight - targetHeight) / 2;

  // Draw Card Drop Shadow
  ctx.save();
  ctx.shadowColor = "rgba(0, 0, 0, 0.65)";
  ctx.shadowBlur = 45;
  ctx.shadowOffsetY = 25;
  ctx.fillStyle = "#000000";
  drawRoundedRect(ctx, photoX, photoY, targetWidth, targetHeight, 28);
  ctx.fill();
  ctx.restore();

  // Draw Photo with Rounded Corners
  ctx.save();
  drawRoundedRect(ctx, photoX, photoY, targetWidth, targetHeight, 28);
  ctx.clip();
  ctx.drawImage(img, photoX, photoY, targetWidth, targetHeight);
  // Subtle photo border
  ctx.strokeStyle = "rgba(255, 255, 255, 0.15)";
  ctx.lineWidth = 2;
  ctx.stroke();
  ctx.restore();

  // 4. Bottom Info Card (Glassmorphic Container)
  const infoCardY = 1370;
  const infoCardHeight = 430;
  const infoCardWidth = STORY_WIDTH - framePadding * 2;

  ctx.save();
  // Glassmorphism card background
  ctx.fillStyle = "rgba(24, 24, 27, 0.75)";
  drawRoundedRect(ctx, framePadding, infoCardY, infoCardWidth, infoCardHeight, 32);
  ctx.fill();
  ctx.strokeStyle = "rgba(255, 255, 255, 0.12)";
  ctx.lineWidth = 1.5;
  ctx.stroke();
  ctx.restore();

  // Title / Photo Title
  const photoTitle = photo.name?.replace(/\.[^/.]+$/, "") || "Untitled Photograph";
  ctx.textAlign = "left";
  ctx.fillStyle = "#ffffff";
  ctx.font = "bold 34px -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif";
  const titleDisplay = photoTitle.length > 32 ? `${photoTitle.slice(0, 32)}...` : photoTitle;
  ctx.fillText(titleDisplay, framePadding + 40, infoCardY + 65);

  // Camera & Lens Details
  let currentInfoY = infoCardY + 115;
  if (params.showExif && (params.cameraName || params.lensName)) {
    ctx.fillStyle = "rgba(255, 255, 255, 0.85)";
    ctx.font = "26px -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif";
    const gearText = [params.cameraName, params.lensName].filter(Boolean).join(" • ");
    const gearDisplay = gearText.length > 42 ? `${gearText.slice(0, 42)}...` : gearText;
    ctx.fillText(gearDisplay, framePadding + 40, currentInfoY);
    currentInfoY += 50;
  }

  // Shooting Parameter Badges (Pills)
  if (params.showExif && (params.shutter || params.aperture || params.focalLength || params.iso)) {
    const badges = [
      params.focalLength,
      params.aperture,
      params.shutter,
      params.iso ? `ISO ${params.iso}` : null,
    ].filter(Boolean) as string[];

    let pillX = framePadding + 40;
    const pillY = currentInfoY;
    const pillHeight = 44;

    ctx.font = "bold 20px -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif";

    for (const badge of badges) {
      const textWidth = ctx.measureText(badge).width;
      const pillWidth = textWidth + 30;

      if (pillX + pillWidth > framePadding + infoCardWidth - (qrImg ? 200 : 40)) break;

      ctx.save();
      ctx.fillStyle = "rgba(255, 255, 255, 0.1)";
      drawRoundedRect(ctx, pillX, pillY, pillWidth, pillHeight, 22);
      ctx.fill();
      ctx.strokeStyle = "rgba(255, 255, 255, 0.2)";
      ctx.lineWidth = 1;
      ctx.stroke();

      ctx.fillStyle = "#ffffff";
      ctx.textAlign = "center";
      ctx.fillText(badge, pillX + pillWidth / 2, pillY + 29);
      ctx.restore();

      pillX += pillWidth + 14;
    }
  }

  // Bottom Scan Prompt & QR Code
  if (qrImg) {
    const qrSize = 140;
    const qrX = framePadding + infoCardWidth - qrSize - 40;
    const qrY = infoCardY + (infoCardHeight - qrSize) / 2;

    ctx.save();
    // QR Code Container background
    ctx.fillStyle = "#ffffff";
    drawRoundedRect(ctx, qrX - 8, qrY - 8, qrSize + 16, qrSize + 16, 20);
    ctx.fill();
    ctx.drawImage(qrImg, qrX, qrY, qrSize, qrSize);
    ctx.restore();

    ctx.textAlign = "right";
    ctx.fillStyle = "rgba(255, 255, 255, 0.5)";
    ctx.font = "16px -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif";
    ctx.fillText("Scan to View", qrX - 18, qrY + qrSize / 2 + 6);
  }

  // Footer Tagline
  ctx.textAlign = "center";
  ctx.fillStyle = "rgba(255, 255, 255, 0.35)";
  ctx.font = "18px -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif";
  ctx.fillText("Shared from NayPict Photography Gallery", STORY_WIDTH / 2, STORY_HEIGHT - 45);
}

/**
 * Template 2: Minimalist Film & Museum Exhibition Matte
 */
function renderMinimalistTemplate(
  ctx: CanvasRenderingContext2D,
  img: HTMLImageElement,
  qrImg: HTMLImageElement | null,
  photo: PhotoVo,
  params: TemplateRenderParams
) {
  // Clean Warm Cream/White background
  ctx.fillStyle = "#faf9f6";
  ctx.fillRect(0, 0, STORY_WIDTH, STORY_HEIGHT);

  // Outer thin film border
  ctx.strokeStyle = "#e4e4e7";
  ctx.lineWidth = 2;
  ctx.strokeRect(40, 40, STORY_WIDTH - 80, STORY_HEIGHT - 80);

  // Header: Exhibition Label
  ctx.fillStyle = "#18181b";
  ctx.font = "bold 32px Georgia, 'Times New Roman', serif";
  ctx.textAlign = "center";
  ctx.fillText(params.galleryTitle || "NAYPICT GALLERY", STORY_WIDTH / 2, 130);

  ctx.fillStyle = "#71717a";
  ctx.font = "18px -apple-system, BlinkMacSystemFont, sans-serif";
  ctx.fillText("SELECTED WORKS • EXHIBITION ARCHIVE", STORY_WIDTH / 2, 168);

  // Central Photo Frame
  const framePadding = 90;
  const frameWidth = STORY_WIDTH - framePadding * 2;
  const maxFrameHeight = 1120;
  const frameTop = 210;

  const imgRatio = (photo.width && photo.height) ? photo.width / photo.height : img.width / img.height;
  let targetWidth = frameWidth;
  let targetHeight = targetWidth / imgRatio;

  if (targetHeight > maxFrameHeight) {
    targetHeight = maxFrameHeight;
    targetWidth = targetHeight * imgRatio;
  }

  const photoX = (STORY_WIDTH - targetWidth) / 2;
  const photoY = frameTop + (maxFrameHeight - targetHeight) / 2;

  // Matte border around photo
  ctx.save();
  ctx.shadowColor = "rgba(0, 0, 0, 0.08)";
  ctx.shadowBlur = 24;
  ctx.shadowOffsetY = 12;
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(photoX - 10, photoY - 10, targetWidth + 20, targetHeight + 20);
  ctx.restore();

  ctx.drawImage(img, photoX, photoY, targetWidth, targetHeight);
  ctx.strokeStyle = "rgba(0, 0, 0, 0.06)";
  ctx.lineWidth = 1;
  ctx.strokeRect(photoX, photoY, targetWidth, targetHeight);

  // Bottom Exhibition Typography
  const bottomY = 1430;
  const photoTitle = photo.name?.replace(/\.[^/.]+$/, "") || "Untitled Photo";

  ctx.textAlign = "left";
  ctx.fillStyle = "#18181b";
  ctx.font = "bold 36px Georgia, 'Times New Roman', serif";
  ctx.fillText(photoTitle, framePadding, bottomY);

  if (params.photographerName) {
    ctx.fillStyle = "#71717a";
    ctx.font = "italic 22px Georgia, 'Times New Roman', serif";
    ctx.fillText(`Photographed by ${params.photographerName}`, framePadding, bottomY + 45);
  }

  // EXIF metadata string
  if (params.showExif) {
    const specs = [
      params.cameraName,
      params.lensName,
      params.focalLength,
      params.aperture,
      params.shutter,
      params.iso ? `ISO${params.iso}` : null,
    ].filter(Boolean).join("  |  ");

    if (specs) {
      ctx.fillStyle = "#52525b";
      ctx.font = "500 20px -apple-system, BlinkMacSystemFont, monospace";
      ctx.fillText(specs, framePadding, bottomY + 105);
    }
  }

  if (params.dateText || params.locationText) {
    const metaLine = [params.dateText, params.locationText].filter(Boolean).join(" • ");
    ctx.fillStyle = "#a1a1aa";
    ctx.font = "18px -apple-system, BlinkMacSystemFont, sans-serif";
    ctx.fillText(metaLine, framePadding, bottomY + 145);
  }

  // Minimalist QR Code
  if (qrImg) {
    const qrSize = 130;
    const qrX = STORY_WIDTH - framePadding - qrSize;
    const qrY = bottomY - 30;

    ctx.drawImage(qrImg, qrX, qrY, qrSize, qrSize);
    ctx.strokeStyle = "#e4e4e7";
    ctx.lineWidth = 1;
    ctx.strokeRect(qrX - 4, qrY - 4, qrSize + 8, qrSize + 8);

    ctx.textAlign = "center";
    ctx.fillStyle = "#a1a1aa";
    ctx.font = "14px -apple-system, BlinkMacSystemFont, sans-serif";
    ctx.fillText("SCAN PHOTO", qrX + qrSize / 2, qrY + qrSize + 24);
  }

  // Bottom Center Footer
  ctx.textAlign = "center";
  ctx.fillStyle = "#a1a1aa";
  ctx.font = "16px -apple-system, BlinkMacSystemFont, sans-serif";
  ctx.fillText("naypict.gallery", STORY_WIDTH / 2, STORY_HEIGHT - 70);
}

/**
 * Template 3: Cinematic Full-Bleed
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
  const topGrad = ctx.createLinearGradient(0, 0, 0, 380);
  topGrad.addColorStop(0, "rgba(0, 0, 0, 0.85)");
  topGrad.addColorStop(0.6, "rgba(0, 0, 0, 0.4)");
  topGrad.addColorStop(1, "rgba(0, 0, 0, 0)");
  ctx.fillStyle = topGrad;
  ctx.fillRect(0, 0, STORY_WIDTH, 380);

  // Bottom Dark Gradient for Text Legibility
  const bottomGrad = ctx.createLinearGradient(0, STORY_HEIGHT - 650, 0, STORY_HEIGHT);
  bottomGrad.addColorStop(0, "rgba(0, 0, 0, 0)");
  bottomGrad.addColorStop(0.3, "rgba(0, 0, 0, 0.6)");
  bottomGrad.addColorStop(1, "rgba(0, 0, 0, 0.95)");
  ctx.fillStyle = bottomGrad;
  ctx.fillRect(0, STORY_HEIGHT - 650, STORY_WIDTH, 650);

  // Top Brand
  ctx.fillStyle = "#ffffff";
  ctx.font = "900 36px -apple-system, BlinkMacSystemFont, sans-serif";
  ctx.textAlign = "left";
  ctx.fillText(params.galleryTitle || "NAYPICT", 80, 130);

  if (params.photographerName) {
    ctx.fillStyle = "rgba(255, 255, 255, 0.7)";
    ctx.font = "22px -apple-system, BlinkMacSystemFont, sans-serif";
    ctx.fillText(`Photo by ${params.photographerName}`, 80, 168);
  }

  // Bottom Info Overlay
  const bottomContentY = STORY_HEIGHT - 280;
  const photoTitle = photo.name?.replace(/\.[^/.]+$/, "") || "Untitled Photograph";

  ctx.fillStyle = "#ffffff";
  ctx.font = "bold 44px -apple-system, BlinkMacSystemFont, sans-serif";
  ctx.textAlign = "left";
  ctx.fillText(photoTitle, 80, bottomContentY);

  if (params.showExif) {
    const gearRow = [params.cameraName, params.lensName].filter(Boolean).join("  •  ");
    if (gearRow) {
      ctx.fillStyle = "rgba(255, 255, 255, 0.85)";
      ctx.font = "24px -apple-system, BlinkMacSystemFont, sans-serif";
      ctx.fillText(gearRow, 80, bottomContentY + 46);
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
      ctx.fillText(shootRow, 80, bottomContentY + 88);
    }
  }

  // QR Code at right corner
  if (qrImg) {
    const qrSize = 130;
    const qrX = STORY_WIDTH - 80 - qrSize;
    const qrY = bottomContentY - 30;

    ctx.save();
    ctx.fillStyle = "rgba(0, 0, 0, 0.6)";
    drawRoundedRect(ctx, qrX - 8, qrY - 8, qrSize + 16, qrSize + 16, 18);
    ctx.fill();
    ctx.drawImage(qrImg, qrX, qrY, qrSize, qrSize);
    ctx.restore();
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
