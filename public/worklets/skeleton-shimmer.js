// CSS Houdini Paint Worklet for zero-layout-shift hardware-rasterized skeleton shimmer.

class SkeletonShimmerPainter {
  static get inputProperties() {
    return [
      '--shimmer-progress',
      '--shimmer-base-color',
      '--shimmer-highlight-color',
    ];
  }

  paint(ctx, geometry, properties) {
    const { width, height } = geometry;
    const rawProgress = properties.get('--shimmer-progress').toString().trim();
    const progress = Number.parseFloat(rawProgress) || 0;

    const baseColor = properties.get('--shimmer-base-color').toString().trim() || 'rgba(128, 128, 128, 0.12)';
    const highlightColor = properties.get('--shimmer-highlight-color').toString().trim() || 'rgba(255, 255, 255, 0.18)';

    // Sweep linear gradient across the width
    const shimmerWidth = width * 0.6;
    const startX = -shimmerWidth + (width + shimmerWidth * 2) * progress;

    const gradient = ctx.createLinearGradient(startX, 0, startX + shimmerWidth, 0);
    gradient.addColorStop(0, baseColor);
    gradient.addColorStop(0.5, highlightColor);
    gradient.addColorStop(1, baseColor);

    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, width, height);
  }
}

if (typeof registerPaint !== 'undefined') {
  registerPaint('skeleton-shimmer', SkeletonShimmerPainter);
}
