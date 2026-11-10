// Original local artwork. Ordered Bayer 4×4, fixed local origin, one CSS-pixel cell.
// Deterministic ordered dithering for app decoration. No media pixels or exported video are modified.
const bayer = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5];
const lavender = [223, 214, 244],
  lime = [213, 255, 69];
const clamp = (v) => Math.max(0, Math.min(1, v));
function sphere(x, y, cx, cy, radius) {
  const nx = (x - cx) / radius,
    ny = (y - cy) / radius;
  const r = nx * nx + ny * ny;
  if (r >= 1) return 0;
  const z = Math.sqrt(1 - r);
  return clamp(0.08 + 0.88 * Math.max(0, -nx * 0.48 - ny * 0.56 + z * 0.67));
}
function draw(canvas) {
  const { width, height } = canvas.getBoundingClientRect();
  if (!width || !height) return;
  // Draw at CSS resolution, then repeat exact cells at the device pixel scale.
  const w = Math.ceil(width),
    h = Math.ceil(height);
  const dpr = Math.min(3, window.devicePixelRatio || 1);
  canvas.width = Math.round(w * dpr);
  canvas.height = Math.round(h * dpr);
  const raster = document.createElement("canvas");
  raster.width = w;
  raster.height = h;
  const ctx = raster.getContext("2d");
  const pixels = ctx.createImageData(w, h);
  const gradient = canvas.dataset.dither === "gradient";
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const u = (x + 0.5) / w,
        v = (y + 0.5) / h;
      let density,
        color = lavender;
      if (canvas.dataset.dither === "portal") {
        // Sculpted orbital field: fixed Bayer cells, composited motion in CSS.
        const nx = (u - 0.5) * 2.5,
          ny = (v - 0.5) * 2.9;
        const angle = Math.atan2(ny, nx),
          radius = Math.hypot(nx, ny);
        const ring = Math.exp(-Math.pow((radius - 0.72) / 0.19, 2));
        const light = 0.25 + 0.7 * Math.max(0, Math.cos(angle + 2.15));
        const horizon = Math.exp(-Math.pow((ny + 0.03) / 0.025, 2)) * 0.24;
        const core = sphere(u * 320, v * 190, 160, 95, 30);
        density = Math.max(
          ring * light,
          horizon * (1 - Math.min(1, Math.abs(nx))),
          core * 0.85,
        );
      } else if (gradient) {
        // A broad folded light field, tapering into untouched chrome.
        density = clamp(
          (0.5 + 0.3 * Math.sin(u * 8 + v * 4)) * (1 - v) ** 2 * 0.5,
        );
      } else {
        const scale = Math.min(w / 320, h / 190);
        const px = (x - w / 2) / scale + 160,
          py = (y - h / 2) / scale + 95;
        const a = sphere(px, py, 130, 93, 78);
        const b = sphere(px, py, 240, 135, 35);
        // Offset film-frame contour, rendered through the same threshold field.
        const frame = px > 33 && px < 288 && py > 24 && py < 169;
        const edge =
          frame && (px < 34.5 || px > 286.5 || py < 25.5 || py > 167.5);
        density = Math.max(a, b, edge ? 0.24 : 0);
        if (b > a) color = lime;
      }
      const threshold = (bayer[(y % 4) * 4 + (x % 4)] + 0.5) / 16;
      if (density < threshold) continue;
      const i = (y * w + x) * 4;
      pixels.data[i] = color[0];
      pixels.data[i + 1] = color[1];
      pixels.data[i + 2] = color[2];
      pixels.data[i + 3] = 255;
    }
  ctx.putImageData(pixels, 0, 0);
  const out = canvas.getContext("2d");
  out.imageSmoothingEnabled = false;
  out.drawImage(raster, 0, 0, canvas.width, canvas.height);
}
export function mountDitherArt(root = document) {
  const observer = new ResizeObserver((entries) => {
    for (const entry of entries) draw(entry.target);
  });
  for (const canvas of root.querySelectorAll("canvas[data-dither]"))
    observer.observe(canvas);
  return () => observer.disconnect();
}
