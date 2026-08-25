// CSS Houdini Paint Worklet for smooth squircle corners and zero-DOM rasterized shadows.

class SmoothCornersPainter {
  static get inputProperties() {
    return ['--smooth-corners', '--smooth-shadow-color', '--smooth-shadow-blur'];
  }

  paint(ctx, geometry, properties) {
    const n = Number(properties.get('--smooth-corners').toString()) || 4;
    const shadowColor = properties.get('--smooth-shadow-color').toString().trim() || 'rgba(0, 0, 0, 0.1)';
    const shadowBlur = Number.parseFloat(properties.get('--smooth-shadow-blur').toString()) || 8;

    const w = geometry.width / 2;
    const h = geometry.height / 2;

    ctx.save();
    ctx.beginPath();

    for (let i = 0; i <= 360; i += 5) {
      const angle = (i * Math.PI) / 180;
      const cosAngle = Math.cos(angle);
      const sinAngle = Math.sin(angle);

      const x = Math.sign(cosAngle) * Math.pow(Math.abs(cosAngle), 2 / n) * w + w;
      const y = Math.sign(sinAngle) * Math.pow(Math.abs(sinAngle), 2 / n) * h + h;

      if (i === 0) {
        ctx.moveTo(x, y);
      } else {
        ctx.lineTo(x, y);
      }
    }

    ctx.closePath();
    ctx.fillStyle = 'rgba(255, 255, 255, 0.01)';
    ctx.shadowColor = shadowColor;
    ctx.shadowBlur = shadowBlur;
    ctx.fill();
    ctx.restore();
  }
}

if (typeof registerPaint !== 'undefined') {
  registerPaint('smooth-corners', SmoothCornersPainter);
}
