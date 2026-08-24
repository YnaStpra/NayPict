// This module provides a high-performance Web Audio API manager with in-memory AudioBuffer caching.

class AudioManager {
  private ctx: AudioContext | null = null;
  private bufferCache: Map<string, AudioBuffer> = new Map();
  private isMuted: boolean = false;

  private getContext(): AudioContext | null {
    if (typeof window === "undefined") return null;
    if (!this.ctx) {
      const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (AudioCtx) {
        this.ctx = new AudioCtx();
      }
    }
    if (this.ctx && this.ctx.state === "suspended") {
      this.ctx.resume().catch(() => {});
    }
    return this.ctx;
  }

  /**
   * Pre-fetches and decodes an audio file into memory for instant 0ms playback.
   */
  public async preload(url: string): Promise<AudioBuffer | null> {
    const cached = this.bufferCache.get(url);
    if (cached) return cached;

    const ctx = this.getContext();
    if (!ctx) return null;

    try {
      const res = await fetch(url);
      const arrayBuffer = await res.arrayBuffer();
      const audioBuffer = await ctx.decodeAudioData(arrayBuffer);
      this.bufferCache.set(url, audioBuffer);
      return audioBuffer;
    } catch {
      return null;
    }
  }

  /**
   * Plays a preloaded audio buffer with low latency and spatial/volume control.
   */
  public async play(url: string, volume: number = 1.0): Promise<void> {
    if (this.isMuted) return;

    const ctx = this.getContext();
    if (!ctx) return;

    let buffer = this.bufferCache.get(url);
    if (!buffer) {
      buffer = (await this.preload(url)) || undefined;
    }
    if (!buffer) return;

    try {
      const source = ctx.createBufferSource();
      const gainNode = ctx.createGain();
      gainNode.gain.setValueAtTime(Math.max(0, Math.min(1, volume)), ctx.currentTime);

      source.buffer = buffer;
      source.connect(gainNode);
      gainNode.connect(ctx.destination);
      source.start(0);
    } catch {
      // Audio playback silently catches user gesture restrictions
    }
  }

  /**
   * Toggle global mute state.
   */
  public setMuted(muted: boolean): void {
    this.isMuted = muted;
  }

  /**
   * Clears the in-memory audio buffer cache.
   */
  public clearCache(): void {
    this.bufferCache.clear();
  }
}

export const audioManager = new AudioManager();
