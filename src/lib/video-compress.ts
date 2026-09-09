// This module provides high-efficiency browser-based video metadata extraction, orientation-aware poster generation, and Mediabunny WebCodecs hardware-accelerated 720p compression with native fallback.

import { rgbaToThumbHash } from "thumbhash";
import {
  Input,
  Output,
  Conversion,
  ALL_FORMATS,
  BlobSource,
  BufferTarget,
  Mp4OutputFormat,
  Quality,
} from "mediabunny";

export interface VideoMetadata {
  duration: number; // in seconds
  width: number;
  height: number;
  posterBase64: string; // JPEG data URL (~30-50KB)
  thumbHash: string;
}

export interface VideoCompressOptions {
  maxDimension?: number; // Default 1280 (for 720p HD)
  bitrate?: number; // In bps, default ~1.1 Mbps for crisp 720p
  onProgress?: (progress: number) => void;
}

export interface Mp4ParsedMetadata {
  rotation: number; // 0, 90, 180, 270
  displayWidth: number;
  displayHeight: number;
}

/**
 * Format video duration into mm:ss or hh:mm:ss.
 */
export function formatVideoDuration(seconds?: number | null): string {
  if (!seconds || isNaN(seconds) || seconds <= 0) return "0:00";
  const s = Math.round(seconds);
  const m = Math.floor(s / 60);
  const remSec = s % 60;
  if (m < 60) {
    return `${m}:${String(remSec).padStart(2, "0")}`;
  }
  const h = Math.floor(m / 60);
  const remMin = m % 60;
  return `${h}:${String(remMin).padStart(2, "0")}:${String(remSec).padStart(2, "0")}`;
}

/**
 * Fast, pure-JavaScript MP4/QuickTime atom parser to extract rotation and display dimensions
 * from track headers (moov -> trak -> tkhd).
 * Reliably handles mobile recordings (Samsung, Android, iPhone, Xiaomi) whether 'moov' is at head or tail.
 */
export async function getMp4RotationAndDimensions(file: File): Promise<Mp4ParsedMetadata | null> {
  function scanBox(view: DataView, start: number, end: number): Mp4ParsedMetadata | null {
    let pos = start;
    while (pos < end - 8) {
      const size = view.getUint32(pos, false);
      const type = String.fromCharCode(
        view.getUint8(pos + 4),
        view.getUint8(pos + 5),
        view.getUint8(pos + 6),
        view.getUint8(pos + 7)
      );

      const boxSize = size === 1 ? Number(view.getBigUint64(pos + 8, false)) : size;
      const headerSize = size === 1 ? 16 : 8;
      const contentEnd = Math.min(pos + boxSize, end);

      if (type === "moov" || type === "trak") {
        const res = scanBox(view, pos + headerSize, contentEnd);
        if (res !== null) return res;
      } else if (type === "tkhd") {
        const version = view.getUint8(pos + headerSize);
        // In ISO 14496-12 TrackHeaderBox:
        // version 0: 4(flags) + 20(timing/id/duration) + 16(res/layer/vol/res) = 40 bytes after header
        // version 1: 4(flags) + 32(timing/id/duration) + 16(res/layer/vol/res) = 52 bytes after header
        const matrixOffset = pos + headerSize + (version === 1 ? 52 : 40);
        if (matrixOffset + 44 <= contentEnd) {
          const a = view.getInt32(matrixOffset, false) / 65536;
          const b = view.getInt32(matrixOffset + 4, false) / 65536;
          const c = view.getInt32(matrixOffset + 12, false) / 65536;
          const d = view.getInt32(matrixOffset + 16, false) / 65536;
          const w = Math.round(view.getInt32(matrixOffset + 36, false) / 65536);
          const h = Math.round(view.getInt32(matrixOffset + 40, false) / 65536);

          let rotation = 0;
          if (a === 0 && b === 1 && c === -1 && d === 0) rotation = 90;
          else if (a === -1 && b === 0 && c === 0 && d === -1) rotation = 180;
          else if (a === 0 && b === -1 && c === 1 && d === 0) rotation = 270;
          else if (b !== 0 || c !== 0) {
            rotation = (Math.round(Math.atan2(b, a) * (180 / Math.PI)) + 360) % 360;
          }

          return { rotation, displayWidth: w, displayHeight: h };
        }
      }

      if (boxSize <= 0) break;
      pos += boxSize;
    }
    return null;
  }

  try {
    // 1. Check head 512KB for 'moov' atom
    const headSize = Math.min(file.size, 512 * 1024);
    const headBuf = await file.slice(0, headSize).arrayBuffer();
    const headRes = scanBox(new DataView(headBuf), 0, headBuf.byteLength);
    if (headRes) return headRes;

    // 2. If 'moov' wasn't in head, check tail 1MB (mobile devices often append moov after mdat)
    if (file.size > 512 * 1024) {
      const tailStart = Math.max(0, file.size - 1024 * 1024);
      const tailBuf = await file.slice(tailStart, file.size).arrayBuffer();
      const bytes = new Uint8Array(tailBuf);
      for (let i = 4; i < bytes.length - 8; i++) {
        // Look for 'm'(109), 'o'(111), 'o'(111), 'v'(118)
        if (bytes[i] === 109 && bytes[i + 1] === 111 && bytes[i + 2] === 111 && bytes[i + 3] === 118) {
          const moovBoxStart = i - 4;
          const tailRes = scanBox(new DataView(tailBuf), moovBoxStart, tailBuf.byteLength);
          if (tailRes) return tailRes;
        }
      }
    }
  } catch (err) {
    console.warn("[VideoCompress] MP4 box parsing skipped:", err);
  }

  return null;
}

/**
 * Extract video dimensions, duration, poster JPEG frame, and ThumbHash in browser.
 * Combines Mediabunny container parsing with HTML5 video frame rendering for 100% orientation accuracy.
 */
export async function extractVideoMetadata(file: File): Promise<VideoMetadata> {
  // 1. Try Mediabunny's fast track inspection first
  let mbMeta: { width: number; height: number; duration: number; rotation: number } | null = null;
  try {
    const input = new Input({
      source: new BlobSource(file),
      formats: ALL_FORMATS,
    });
    const videoTrack = await input.getPrimaryVideoTrack();
    if (videoTrack) {
      const d = (await input.computeDuration().catch(() => 0)) || 0;
      const dw = await videoTrack.getDisplayWidth().catch(() => 0);
      const dh = await videoTrack.getDisplayHeight().catch(() => 0);
      const r = await videoTrack.getRotation().catch(() => 0);
      if (dw > 0 && dh > 0) {
        mbMeta = { width: dw, height: dh, duration: d, rotation: r };
      }
    }
  } catch (err) {
    console.warn("[VideoCompress] Mediabunny track inspection skipped:", err);
  }

  // 2. Fallback to direct atom parser if needed
  const atomMeta = mbMeta ? null : await getMp4RotationAndDimensions(file).catch(() => null);
  const rotation = mbMeta?.rotation ?? atomMeta?.rotation ?? 0;
  const isRotated = rotation === 90 || rotation === 270;

  return new Promise((resolve) => {
    if (typeof window === "undefined" || typeof document === "undefined") {
      return resolve({
        duration: mbMeta?.duration || 0,
        width: mbMeta?.width || 1280,
        height: mbMeta?.height || 720,
        posterBase64: "",
        thumbHash: "",
      });
    }

    const container = document.createElement("div");
    container.style.cssText = "position:fixed;bottom:0;right:0;width:320px;height:180px;overflow:hidden;opacity:0.01;pointer-events:none;z-index:-1;";
    const video = document.createElement("video");
    const videoUrl = URL.createObjectURL(file);

    video.muted = true;
    video.defaultMuted = true;
    video.playsInline = true;
    video.setAttribute("playsinline", "true");
    video.setAttribute("webkit-playsinline", "true");
    video.setAttribute("muted", "");
    video.preload = "auto";
    video.style.cssText = "width:320px;height:180px;visibility:visible;";
    container.appendChild(video);
    document.body.appendChild(container);

    let finished = false;
    let fallbackPoster = "";
    let fallbackThumbHash = "";

    const cleanup = () => {
      if (finished) return;
      finished = true;
      video.pause();
      video.removeAttribute("src");
      video.load();
      if (container.parentNode) {
        container.parentNode.removeChild(container);
      }
      URL.revokeObjectURL(videoUrl);
    };

    let knownDuration = mbMeta?.duration || 0;
    let knownWidth = mbMeta?.width || 0;
    let knownHeight = mbMeta?.height || 0;

    const getVisualDimensions = () => {
      if (mbMeta && mbMeta.width > 0 && mbMeta.height > 0) {
        return { width: mbMeta.width, height: mbMeta.height };
      }

      const rawW = video.videoWidth || knownWidth || 1280;
      const rawH = video.videoHeight || knownHeight || 720;

      if (isRotated) {
        return {
          width: Math.min(rawW, rawH),
          height: Math.max(rawW, rawH),
        };
      }

      if (atomMeta && atomMeta.displayWidth > 0 && atomMeta.displayHeight > 0) {
        return {
          width: atomMeta.displayWidth,
          height: atomMeta.displayHeight,
        };
      }

      return {
        width: rawW,
        height: rawH,
      };
    };

    const takeSnapshot = (): { poster: string; hash: string; isBlack: boolean } => {
      try {
        const { width, height } = getVisualDimensions();
        if (!width || !height) {
          return { poster: "", hash: "", isBlack: true };
        }

        const posterCanvas = document.createElement("canvas");
        const maxPosterDim = 1280;
        let pWidth = width;
        let pHeight = height;

        if (pWidth > maxPosterDim || pHeight > maxPosterDim) {
          if (pWidth > pHeight) {
            pHeight = Math.round((pHeight * maxPosterDim) / pWidth);
            pWidth = maxPosterDim;
          } else {
            pWidth = Math.round((pWidth * maxPosterDim) / pHeight);
            pHeight = maxPosterDim;
          }
        }

        posterCanvas.width = pWidth;
        posterCanvas.height = pHeight;
        const ctx = posterCanvas.getContext("2d");
        let poster = "";
        let isBlack = true;
        if (ctx) {
          ctx.drawImage(video, 0, 0, pWidth, pHeight);

          // Sample pixels to verify non-black frame
          try {
            const samplePoints = [
              [Math.floor(pWidth * 0.5), Math.floor(pHeight * 0.5)],
              [Math.floor(pWidth * 0.3), Math.floor(pHeight * 0.3)],
              [Math.floor(pWidth * 0.7), Math.floor(pHeight * 0.3)],
              [Math.floor(pWidth * 0.3), Math.floor(pHeight * 0.7)],
              [Math.floor(pWidth * 0.7), Math.floor(pHeight * 0.7)],
              [Math.floor(pWidth * 0.5), Math.floor(pHeight * 0.2)],
              [Math.floor(pWidth * 0.5), Math.floor(pHeight * 0.8)],
            ];
            for (const [x, y] of samplePoints) {
              const pixel = ctx.getImageData(x, y, 1, 1).data;
              if (pixel[0] > 16 || pixel[1] > 16 || pixel[2] > 16) {
                isBlack = false;
                break;
              }
            }
          } catch {
            isBlack = false;
          }

          poster = posterCanvas.toDataURL("image/jpeg", 0.85);
        }

        let hash = "";
        try {
          const hashCanvas = document.createElement("canvas");
          const maxHashDim = 100;
          let hWidth = width;
          let hHeight = height;
          if (hWidth > maxHashDim || hHeight > maxHashDim) {
            if (hWidth > hHeight) {
              hHeight = Math.round((hHeight * maxHashDim) / hWidth);
              hWidth = maxHashDim;
            } else {
              hWidth = Math.round((hWidth * maxHashDim) / hHeight);
              hHeight = maxHashDim;
            }
          }
          hashCanvas.width = hWidth;
          hashCanvas.height = hHeight;
          const hCtx = hashCanvas.getContext("2d");
          if (hCtx) {
            hCtx.drawImage(video, 0, 0, hWidth, hHeight);
            const imageData = hCtx.getImageData(0, 0, hWidth, hHeight);
            const hashBytes = rgbaToThumbHash(hWidth, hHeight, imageData.data);
            hash = Array.from(hashBytes)
              .map((b) => b.toString(16).padStart(2, "0"))
              .join("");
          }
        } catch {}

        return { poster, hash, isBlack };
      } catch {
        return { poster: "", hash: "", isBlack: true };
      }
    };

    const finishWithSnapshot = () => {
      const snap = takeSnapshot();
      const finalPoster = (!snap.isBlack && snap.poster) ? snap.poster : fallbackPoster;
      const finalHash = (!snap.isBlack && snap.hash) ? snap.hash : fallbackThumbHash;
      const { width: finalWidth, height: finalHeight } = getVisualDimensions();
      const finalDuration = (video.duration && !isNaN(video.duration)) ? video.duration : (knownDuration || 0);
      cleanup();
      resolve({
        duration: finalDuration,
        width: finalWidth,
        height: finalHeight,
        posterBase64: finalPoster,
        thumbHash: finalHash,
      });
    };

    const timeout = setTimeout(() => {
      finishWithSnapshot();
    }, 12000);

    let hasSought = false;

    const onDataReady = () => {
      if (finished) return;

      if (video.duration && !isNaN(video.duration)) {
        knownDuration = video.duration;
      }
      if (video.videoWidth > 0 && video.videoHeight > 0) {
        knownWidth = video.videoWidth;
        knownHeight = video.videoHeight;
      }

      const duration = knownDuration || video.duration || 0;
      const rawW = knownWidth || video.videoWidth;
      const rawH = knownHeight || video.videoHeight;

      if (rawW > 0 && rawH > 0 && video.readyState >= 2) {
        const initialSnap = takeSnapshot();
        if (!initialSnap.isBlack && initialSnap.poster) {
          fallbackPoster = initialSnap.poster;
          fallbackThumbHash = initialSnap.hash;
          clearTimeout(timeout);
          finishWithSnapshot();
          return;
        }

        if (!hasSought) {
          hasSought = true;
          const seekTargets = duration > 3
            ? [1.0, 2.0, Math.min(5.0, duration / 2), 0.5]
            : [Math.min(1.0, Math.max(0.2, duration * 0.5)), 0.2];
          let seekIdx = 0;

          const tryNextSeek = () => {
            if (finished) return;
            if (seekIdx >= seekTargets.length) {
              clearTimeout(timeout);
              finishWithSnapshot();
              return;
            }

            const targetTime = seekTargets[seekIdx++];
            const seekTimer = setTimeout(() => {
              tryNextSeek();
            }, 3000);

            video.onseeked = () => {
              clearTimeout(seekTimer);
              // Give browser decoder 60ms to paint decoded frame onto canvas surface
              setTimeout(() => {
                if (finished) return;
                const snap = takeSnapshot();
                if (!snap.isBlack && snap.poster) {
                  fallbackPoster = snap.poster;
                  fallbackThumbHash = snap.hash;
                  clearTimeout(timeout);
                  finishWithSnapshot();
                  return;
                }
                tryNextSeek();
              }, 60);
            };

            try {
              video.currentTime = targetTime;
            } catch {
              clearTimeout(seekTimer);
              tryNextSeek();
            }
          };

          tryNextSeek();
          return;
        }

        clearTimeout(timeout);
        finishWithSnapshot();
      }
    };

    video.onloadedmetadata = () => {
      if (video.duration && !isNaN(video.duration)) {
        knownDuration = video.duration;
      }
      if (video.videoWidth > 0 && video.videoHeight > 0) {
        knownWidth = video.videoWidth;
        knownHeight = video.videoHeight;
      }
      onDataReady();
    };

    video.onloadeddata = onDataReady;
    video.oncanplay = onDataReady;

    video.onerror = () => {
      console.warn("[VideoCompress] Video element error during metadata extraction:", video.error);
      clearTimeout(timeout);
      cleanup();
      const { width: finalWidth, height: finalHeight } = getVisualDimensions();
      resolve({
        duration: knownDuration || 0,
        width: finalWidth,
        height: finalHeight,
        posterBase64: fallbackPoster,
        thumbHash: fallbackThumbHash,
      });
    };

    video.src = videoUrl;
    video.load();
  });
}

/**
 * Checks supported browser MIME type for video encoding, matching audio presence.
 */
function getSupportedVideoMimeType(hasAudio: boolean): string | null {
  if (typeof window === "undefined" || !("MediaRecorder" in window)) return null;

  const audioCandidates = [
    "video/mp4;codecs=avc1.42E01E,mp4a.40.2",
    "video/mp4;codecs=avc1,mp4a.40.2",
    "video/mp4",
    "video/webm;codecs=vp9,opus",
    "video/webm;codecs=vp8,opus",
    "video/webm",
  ];

  const videoOnlyCandidates = [
    "video/mp4;codecs=avc1.42E01E",
    "video/mp4;codecs=avc1",
    "video/mp4",
    "video/webm;codecs=vp9",
    "video/webm;codecs=vp8",
    "video/webm",
  ];

  const candidates = hasAudio ? audioCandidates : videoOnlyCandidates;

  for (const mime of candidates) {
    if (MediaRecorder.isTypeSupported(mime)) {
      return mime;
    }
  }

  return null;
}

/**
 * Hardware-accelerated 720p compression using Mediabunny (WebCodecs).
 * Compresses videos at blazing GPU speed with Variable Bitrate (VBR) optimization.
 */
async function compressWithMediabunny(
  file: File,
  meta: VideoMetadata,
  targetWidth: number,
  targetHeight: number,
  finalBitrate: number,
  onProgress?: (progress: number) => void
): Promise<File | null> {
  if (
    typeof window === "undefined" ||
    !("VideoEncoder" in window) ||
    !("VideoDecoder" in window)
  ) {
    return null;
  }

  try {
    console.log("[VideoCompress] Attempting Mediabunny WebCodecs hardware conversion...");

    const input = new Input({
      source: new BlobSource(file),
      formats: ALL_FORMATS,
    });

    const output = new Output({
      format: new Mp4OutputFormat(),
      target: new BufferTarget(),
    });

    const conversion = await Conversion.init({
      input,
      output,
      video: {
        width: targetWidth,
        height: targetHeight,
        fit: "contain",
        codec: "avc", // H.264
        quality: new Quality({
          bitrate: finalBitrate,
          bitrateMode: "variable",
        }),
        allowRotationMetadata: false, // Bakes rotation directly into pixels so video is permanently upright
        forceTranscode: true,
      },
      audio: {
        codec: "aac",
        quality: new Quality({
          bitrate: 128_000, // 128kbps stereo AAC
        }),
      },
      showWarnings: false,
    });

    if (!conversion.isValid) {
      console.warn("[VideoCompress] Mediabunny conversion not valid for this input, falling back to native:", conversion.discardedTracks);
      return null;
    }

    conversion.onProgress = (progress) => {
      onProgress?.(Math.min(99, Math.round(progress * 100)));
    };

    await conversion.execute();

    const buffer = output.target.buffer;
    if (!buffer || buffer.byteLength === 0) {
      console.warn("[VideoCompress] Mediabunny produced empty buffer, falling back to native");
      return null;
    }

    console.log("[VideoCompress] Mediabunny conversion succeeded:", {
      originalSize: `${(file.size / (1024 * 1024)).toFixed(1)}MB`,
      compressedSize: `${(buffer.byteLength / (1024 * 1024)).toFixed(1)}MB`,
      savedPercent: `${Math.round((1 - buffer.byteLength / file.size) * 100)}%`,
    });

    if (buffer.byteLength >= file.size) {
      console.warn("[VideoCompress] Mediabunny result not smaller than original, returning original");
      return file;
    }

    const baseName = file.name.replace(/\.[^/.]+$/, "");
    const compressedFile = new File([buffer], `${baseName}.mp4`, {
      type: "video/mp4",
      lastModified: file.lastModified,
    });

    Object.defineProperties(compressedFile, {
      videoWidth: { value: targetWidth, writable: true },
      videoHeight: { value: targetHeight, writable: true },
    });

    onProgress?.(100);
    return compressedFile;
  } catch (err) {
    console.warn("[VideoCompress] Mediabunny conversion threw error, falling back to native canvas:", err);
    return null;
  }
}

/**
 * Native Canvas + Web Audio + MediaRecorder fallback compressor.
 */
async function compressWithNativeCanvas(
  file: File,
  meta: VideoMetadata,
  targetWidth: number,
  targetHeight: number,
  finalBitrate: number,
  onProgress?: (progress: number) => void
): Promise<File> {
  return new Promise(async (resolve) => {
    const container = document.createElement("div");
    container.style.cssText = "position:fixed;bottom:0;right:0;width:1px;height:1px;overflow:hidden;opacity:0.01;pointer-events:none;z-index:9999;";
    const video = document.createElement("video");
    const videoUrl = URL.createObjectURL(file);

    video.muted = true;
    video.defaultMuted = true;
    video.playsInline = true;
    video.setAttribute("playsinline", "true");
    video.setAttribute("webkit-playsinline", "true");
    video.setAttribute("muted", "");
    video.preload = "auto";
    video.style.cssText = "width:320px;height:180px;visibility:visible;";
    container.appendChild(video);
    document.body.appendChild(container);

    const canvas = document.createElement("canvas");
    canvas.width = targetWidth;
    canvas.height = targetHeight;
    const ctx = canvas.getContext("2d", { alpha: false });
    if (ctx) {
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = "high";
    }

    let animationFrameId: number;
    let frameCallbackId: number;
    let mediaRecorder: MediaRecorder | null = null;
    let audioContext: AudioContext | null = null;
    let audioSourceNode: AudioBufferSourceNode | null = null;
    let safetyTimer: ReturnType<typeof setTimeout> | null = null;
    let isCleanedUp = false;
    const recordedChunks: Blob[] = [];

    const cleanup = () => {
      if (isCleanedUp) return;
      isCleanedUp = true;
      if (safetyTimer) clearTimeout(safetyTimer);
      if (animationFrameId) cancelAnimationFrame(animationFrameId);
      if (frameCallbackId && "cancelVideoFrameCallback" in video) {
        (video as any).cancelVideoFrameCallback(frameCallbackId);
      }
      if (audioSourceNode) {
        try { audioSourceNode.stop(); } catch {}
      }
      if (audioContext && audioContext.state !== "closed") {
        try { void audioContext.close(); } catch {}
      }
      video.pause();
      video.removeAttribute("src");
      video.load();
      if (container.parentNode) {
        container.parentNode.removeChild(container);
      }
      URL.revokeObjectURL(videoUrl);
    };

    let audioTrack: MediaStreamTrack | null = null;
    try {
      const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
      if (AudioContextClass) {
        audioContext = new AudioContextClass();
        const arrayBuffer = await file.slice(0, Math.min(file.size, 100 * 1024 * 1024)).arrayBuffer();
        const audioBuffer = await audioContext.decodeAudioData(arrayBuffer).catch(() => null);
        if (audioBuffer && audioBuffer.numberOfChannels > 0 && audioBuffer.duration > 0) {
          const dest = audioContext.createMediaStreamDestination();
          audioSourceNode = audioContext.createBufferSource();
          audioSourceNode.buffer = audioBuffer;
          audioSourceNode.connect(dest);
          const tracks = dest.stream.getAudioTracks();
          if (tracks.length > 0) {
            audioTrack = tracks[0];
          }
        }
      }
    } catch (err) {
      console.warn("[VideoCompress] Audio decode warning:", err);
    }

    const hasAudio = Boolean(audioTrack);
    const mimeType = getSupportedVideoMimeType(hasAudio);
    if (!mimeType) {
      console.warn("[VideoCompress] No supported MediaRecorder MIME type found in browser");
      cleanup();
      resolve(file);
      return;
    }

    video.onloadedmetadata = () => {
      try {
        const stream = canvas.captureStream(30);
        if (audioTrack) {
          stream.addTrack(audioTrack);
        }

        const recorderOptions: MediaRecorderOptions = {
          mimeType,
          videoBitsPerSecond: finalBitrate,
        };
        if (audioTrack) {
          recorderOptions.audioBitsPerSecond = 128_000;
        }

        mediaRecorder = new MediaRecorder(stream, recorderOptions);

        mediaRecorder.onerror = (event: any) => {
          console.warn("[VideoCompress] MediaRecorder error:", event?.error || event);
          stopTranscoding();
        };

        mediaRecorder.ondataavailable = (event) => {
          if (event.data && event.data.size > 0) {
            recordedChunks.push(event.data);
          }
        };

        mediaRecorder.onstop = () => {
          cleanup();
          const extension = mimeType.includes("mp4") ? "mp4" : "webm";
          const outputBlob = new Blob(recordedChunks, { type: mimeType });

          console.log("[VideoCompress] Native compression finished:", {
            originalSize: `${(file.size / (1024 * 1024)).toFixed(1)}MB`,
            compressedSize: `${(outputBlob.size / (1024 * 1024)).toFixed(1)}MB`,
            savedPercent: `${Math.round((1 - outputBlob.size / file.size) * 100)}%`,
          });

          if (outputBlob.size === 0 || outputBlob.size >= file.size) {
            console.warn("[VideoCompress] Output not smaller than original or empty, keeping original file");
            resolve(file);
            return;
          }

          const baseName = file.name.replace(/\.[^/.]+$/, "");
          const compressedFile = new File([outputBlob], `${baseName}.${extension}`, {
            type: mimeType.split(";")[0],
            lastModified: file.lastModified,
          });

          Object.defineProperties(compressedFile, {
            videoWidth: { value: targetWidth, writable: true },
            videoHeight: { value: targetHeight, writable: true },
          });

          onProgress?.(100);
          resolve(compressedFile);
        };

        const totalDuration = video.duration || meta.duration || 0;
        let isStopped = false;

        const stopTranscoding = () => {
          if (isStopped) return;
          isStopped = true;
          if (mediaRecorder && mediaRecorder.state === "recording") {
            mediaRecorder.stop();
          }
        };

        video.onended = stopTranscoding;

        const maxTimeSeconds = Math.max(Math.round(totalDuration + 60), 180);
        safetyTimer = setTimeout(stopTranscoding, maxTimeSeconds * 1000);

        video.currentTime = 0;
        video.playbackRate = 1.0;

        const startRecording = () => {
          if (ctx) {
            ctx.drawImage(video, 0, 0, targetWidth, targetHeight);
          }
          try {
            mediaRecorder?.start(250);
            if (audioSourceNode) {
              audioSourceNode.start(0);
            }
          } catch (recErr) {
            console.warn("[VideoCompress] MediaRecorder start error:", recErr);
          }
        };

        const tryPlay = async () => {
          video.muted = true;

          try {
            await video.play();
            startRecording();
          } catch (err) {
            console.warn("[VideoCompress] Playback failed:", err);
            cleanup();
            resolve(file);
            return;
          }

          function renderFrame() {
            if (isStopped) return;

            if (
              video.ended ||
              (totalDuration > 0 && video.currentTime >= totalDuration - 0.08)
            ) {
              stopTranscoding();
              return;
            }

            if (video.paused && !video.ended) {
              void video.play().catch(() => {});
            }

            if (ctx) {
              ctx.drawImage(video, 0, 0, targetWidth, targetHeight);
            }

            if (totalDuration > 0) {
              const progress = Math.min(99, Math.round((video.currentTime / totalDuration) * 100));
              onProgress?.(progress);
            }

            if ("requestVideoFrameCallback" in video) {
              frameCallbackId = (video as any).requestVideoFrameCallback(renderFrame);
            } else {
              animationFrameId = requestAnimationFrame(renderFrame);
            }
          }

          renderFrame();
        };

        void tryPlay();
      } catch (err) {
        console.warn("[VideoCompress] Unexpected error during compression setup:", err);
        cleanup();
        resolve(file);
      }
    };

    video.onerror = () => {
      console.warn("[VideoCompress] Video loading error during compression:", video.error);
      cleanup();
      resolve(file);
    };

    video.src = videoUrl;
    video.load();
  });
}

// Concurrency semaphore: strictly cap simultaneous video compressions to 4 workers
// to prevent hardware decoder contention, GPU memory exhaustion, and browser crashes.
let activeVideoCompressions = 0;
const videoCompressQueue: Array<() => void> = [];

/**
 * Acquire a compression execution slot (max 4 concurrent workers).
 */
async function acquireCompressSlot(): Promise<void> {
  if (activeVideoCompressions < 4) {
    activeVideoCompressions++;
    return;
  }
  return new Promise<void>((resolve) => {
    videoCompressQueue.push(() => {
      activeVideoCompressions++;
      resolve();
    });
  });
}

/**
 * Release a compression execution slot and wake up the next queued task.
 */
function releaseCompressSlot(): void {
  activeVideoCompressions = Math.max(0, activeVideoCompressions - 1);
  const next = videoCompressQueue.shift();
  if (next) {
    next();
  }
}

/**
 * Smart 720p Video Compressor:
 * - Uses Mediabunny (WebCodecs hardware acceleration) for ultra-fast, high-efficiency VBR encoding.
 * - Falls back seamlessly to native Canvas/WebAudio/MediaRecorder pipeline on legacy browsers.
 * - Downscales 4K and 1080p videos to optimized 720p HD (~1.1 Mbps) achieving ~85%-95% size reduction.
 * - Respects true aspect ratio (portrait 9:16, landscape 16:9, or square 1:1) and bakes rotation permanently into frames.
 * - Strictly capped at 4 concurrent encoding workers to ensure system stability.
 */
export async function compressVideoTo720p(
  file: File,
  meta: VideoMetadata,
  options: VideoCompressOptions = {}
): Promise<File> {
  const { maxDimension = 1280, onProgress } = options;

  const isPortrait = meta.height > meta.width;
  const longEdge = isPortrait ? meta.height : meta.width;
  const shortEdge = isPortrait ? meta.width : meta.height;

  // If video is already 720p or lower and size is moderate (< 20MB), skip re-encoding
  if (shortEdge <= 720 && longEdge <= 1280 && file.size <= 20 * 1024 * 1024) {
    console.log("[VideoCompress] Video already 720p or smaller (<20MB), skipping compression:", {
      dimensions: `${meta.width}x${meta.height}`,
      size: file.size,
    });
    onProgress?.(100);
    return file;
  }

  // Calculate target 720p dimensions maintaining true visual orientation
  let targetWidth = meta.width || (isPortrait ? 720 : 1280);
  let targetHeight = meta.height || (isPortrait ? 1280 : 720);

  if (isPortrait) {
    if (targetWidth > 720 || targetHeight > maxDimension) {
      const scale = Math.min(720 / targetWidth, maxDimension / targetHeight);
      targetWidth = Math.round((targetWidth * scale) / 2) * 2;
      targetHeight = Math.round((targetHeight * scale) / 2) * 2;
    }
  } else {
    if (targetHeight > 720 || targetWidth > maxDimension) {
      const scale = Math.min(maxDimension / targetWidth, 720 / targetHeight);
      targetWidth = Math.round((targetWidth * scale) / 2) * 2;
      targetHeight = Math.round((targetHeight * scale) / 2) * 2;
    }
  }

  // Ensure even dimensions required for video codecs
  targetWidth = Math.max(2, Math.round(targetWidth / 2) * 2);
  targetHeight = Math.max(2, Math.round(targetHeight / 2) * 2);

  // Calculate optimal adaptive bitrate (~1.1 Mbps for 720p produces ~8.2MB/min)
  const pixels = targetWidth * targetHeight;
  const defaultBitrate = Math.round(
    Math.min(1_400_000, Math.max(700_000, (pixels / 921_600) * 1_100_000))
  );
  const finalBitrate = options.bitrate || defaultBitrate;

  console.log("[VideoCompress] Starting 720p compression:", {
    originalSize: `${(file.size / (1024 * 1024)).toFixed(1)}MB`,
    visualDimensions: `${meta.width}x${meta.height}`,
    targetDimensions: `${targetWidth}x${targetHeight}`,
    isPortrait,
    bitrate: `${Math.round(finalBitrate / 1000)}kbps`,
  });

  await acquireCompressSlot();
  try {
    // 1. Primary Strategy: Blazing fast Mediabunny WebCodecs hardware GPU conversion
    const mediabunnyResult = await compressWithMediabunny(
      file,
      meta,
      targetWidth,
      targetHeight,
      finalBitrate,
      onProgress
    );

    if (mediabunnyResult) {
      return mediabunnyResult;
    }

    // 2. Secondary Strategy: Resilient native canvas pipeline fallback
    console.log("[VideoCompress] Falling back to native canvas pipeline");
    return await compressWithNativeCanvas(
      file,
      meta,
      targetWidth,
      targetHeight,
      finalBitrate,
      onProgress
    );
  } finally {
    releaseCompressSlot();
  }
}
