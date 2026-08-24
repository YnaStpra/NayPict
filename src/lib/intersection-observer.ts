// This module provides a high-performance singleton IntersectionObserver with micro-task queue batching.

type IntersectionCallback = (entry: IntersectionObserverEntry) => void;

class SharedIntersectionObserver {
  private observer: IntersectionObserver | null = null;
  private callbacks: Map<Element, IntersectionCallback> = new Map();
  private pendingEntries: IntersectionObserverEntry[] = [];
  private isMicroTaskScheduled: boolean = false;

  private getObserver(): IntersectionObserver | null {
    if (typeof window === "undefined" || !("IntersectionObserver" in window)) {
      return null;
    }

    if (!this.observer) {
      this.observer = new IntersectionObserver(
        (entries) => {
          this.pendingEntries.push(...entries);
          if (!this.isMicroTaskScheduled) {
            this.isMicroTaskScheduled = true;
            queueMicrotask(() => this.flushEntries());
          }
        },
        {
          rootMargin: "250px 0px",
          threshold: [0, 0.25, 0.5, 0.75, 1],
        }
      );
    }

    return this.observer;
  }

  private flushEntries(): void {
    this.isMicroTaskScheduled = false;
    const entries = this.pendingEntries.splice(0, this.pendingEntries.length);
    for (const entry of entries) {
      const callback = this.callbacks.get(entry.target);
      if (callback) {
        callback(entry);
      }
    }
  }

  /**
   * Observe an element with a batch-debounced callback.
   */
  public observe(element: Element, callback: IntersectionCallback): () => void {
    const obs = this.getObserver();
    if (!obs) return () => {};

    this.callbacks.set(element, callback);
    obs.observe(element);

    return () => {
      this.callbacks.delete(element);
      obs.unobserve(element);
    };
  }
}

export const sharedObserver = new SharedIntersectionObserver();
