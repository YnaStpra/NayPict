import sharp from 'sharp';

// This module provides dynamic watermark generation and compositing over photo buffers using Sharp and SVG vector overlays.

export interface WatermarkOptions {
  text?: string;
  opacity?: number;
}

// Composite a subtle copyright watermark onto a photo buffer in the bottom-right corner.
export async function applyWatermark(
  imageBuffer: Buffer,
  options: WatermarkOptions = {}
): Promise<{ buffer: Buffer; contentType: string }> {
  const text = (options.text || '© NayPict').trim();
  const opacity = Math.max(0.1, Math.min(1.0, options.opacity ?? 0.8));

  // Inspect image dimensions to scale watermark typography proportionally
  const metadata = await sharp(imageBuffer).metadata();
  const width = metadata.width || 1920;
  const height = metadata.height || 1080;
  const format = metadata.format || 'jpeg';

  // Responsive font size calculation based on image width
  const fontSize = Math.max(18, Math.min(54, Math.floor(width / 40)));
  const marginX = Math.max(20, Math.floor(width / 35));
  const marginY = Math.max(20, Math.floor(height / 35));
  const posX = width - marginX;
  const posY = height - marginY;

  // Escape special XML characters for SVG text safety
  const safeText = text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');

  // Render vector SVG watermark with soft drop-shadow for visibility on any background
  const svgWatermark = `
    <svg width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" xmlns="http://www.w3.org/2000/svg">
      <style>
        .watermark-shadow {
          font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
          font-weight: 600;
          font-size: ${fontSize}px;
          fill: rgba(0, 0, 0, ${opacity * 0.7});
          text-anchor: end;
        }
        .watermark-text {
          font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
          font-weight: 600;
          font-size: ${fontSize}px;
          fill: rgba(255, 255, 255, ${opacity});
          text-anchor: end;
        }
      </style>
      <text x="${posX + 1.5}" y="${posY + 1.5}" class="watermark-shadow">${safeText}</text>
      <text x="${posX}" y="${posY}" class="watermark-text">${safeText}</text>
    </svg>
  `;

  // Composite SVG overlay onto base image
  const watermarkedBuffer = await sharp(imageBuffer)
    .composite([
      {
        input: Buffer.from(svgWatermark),
        top: 0,
        left: 0,
      },
    ])
    .toBuffer();

  const contentType = format === 'png' ? 'image/png' : format === 'webp' ? 'image/webp' : 'image/jpeg';

  return {
    buffer: watermarkedBuffer,
    contentType,
  };
}
