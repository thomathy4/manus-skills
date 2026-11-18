// Small numeric / geometry helpers shared by the prototype modules.

export const TAU = Math.PI * 2;

export const deg = (d) => (d * Math.PI) / 180;

export const clamp = (v, min, max) => Math.min(max, Math.max(min, v));

export const round = (v, digits = 1) => {
  const f = 10 ** digits;
  return Number.isFinite(v) ? Math.round(v * f) / f : v;
};

export const fmt = (v, digits = 1) =>
  Number.isFinite(v) ? v.toFixed(digits) : '—';

export const distance = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);

export const pointInRect = (p, r) =>
  p.x >= r.x && p.x <= r.x + r.w && p.y >= r.y && p.y <= r.y + r.h;

export const rectCenter = (r) => ({ x: r.x + r.w / 2, y: r.y + r.h / 2 });

export const expandRect = (r, m) => ({
  x: r.x - m,
  y: r.y - m,
  w: r.w + m * 2,
  h: r.h + m * 2,
});

export function hash01(seed) {
  let h = seed >>> 0;
  h ^= h << 13;
  h >>>= 0;
  h ^= h >> 17;
  h ^= h << 5;
  h >>>= 0;
  return h / 4294967296;
}

// Deterministic pseudo-measurement noise, so a demo replays identically.
export function noise(seed, index, sigma) {
  const h = (Math.imul(seed >>> 0, 2654435761) + Math.imul(index + 1, 40503)) >>> 0;
  return (hash01(h) - 0.5) * 2 * sigma;
}

export function idHash(str) {
  let h = 2166136261;
  for (let i = 0; i < str.length; i += 1) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

export const nowMs = () => performance.now();

// Canvas sized to its CSS box at device pixel ratio; returns CSS-pixel space.
export function setupCanvas(canvas) {
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const rect = canvas.getBoundingClientRect();
  const w = Math.max(1, Math.round(rect.width));
  const h = Math.max(1, Math.round(rect.height));
  const bw = Math.round(w * dpr);
  const bh = Math.round(h * dpr);
  if (canvas.width !== bw || canvas.height !== bh) {
    canvas.width = bw;
    canvas.height = bh;
  }
  const ctx = canvas.getContext('2d');
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, w, h);
  return { ctx, w, h };
}

export function line(ctx, x1, y1, x2, y2, color, width = 1, dash = null) {
  ctx.save();
  ctx.strokeStyle = color;
  ctx.lineWidth = width;
  if (dash) ctx.setLineDash(dash);
  ctx.beginPath();
  ctx.moveTo(x1, y1);
  ctx.lineTo(x2, y2);
  ctx.stroke();
  ctx.restore();
}

export function marker(ctx, x, y, color, radius = 3.5, shape = 'circle', filled = false) {
  ctx.save();
  ctx.strokeStyle = color;
  ctx.fillStyle = color;
  ctx.lineWidth = 1.4;
  ctx.beginPath();
  if (shape === 'triangle') {
    ctx.moveTo(x, y - radius * 1.4);
    ctx.lineTo(x + radius * 1.3, y + radius);
    ctx.lineTo(x - radius * 1.3, y + radius);
    ctx.closePath();
  } else if (shape === 'square') {
    ctx.rect(x - radius, y - radius, radius * 2, radius * 2);
  } else {
    ctx.arc(x, y, radius, 0, TAU);
  }
  if (filled) ctx.fill();
  else ctx.stroke();
  ctx.restore();
}

export function label(ctx, text, x, y, color, align = 'left', size = 10) {
  ctx.save();
  ctx.fillStyle = color;
  ctx.font = `${size}px ui-monospace, SFMono-Regular, Menlo, monospace`;
  ctx.textAlign = align;
  ctx.textBaseline = 'middle';
  ctx.fillText(text, x, y);
  ctx.restore();
}
