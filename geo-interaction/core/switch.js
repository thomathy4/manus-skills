// Section 4 — universal switch interaction.
//
// A single fixed switch supplies only a binary activation. The system supplies
// the missing spatial dimension through progressive subdivision of the screen,
// guided by the referential map's element boundaries but never limited to them.

import { rectCenter } from './util.js';

export class SwitchController {
  constructor({ log, map, calibration, onActivate }) {
    this.log = log;
    this.map = map;
    this.cal = calibration;
    this.onActivate = onActivate;
    this.config = {
      depth: 3,
      mode: 'step', // 'step' = activation advances the highlight; 'auto' = timed scan
      scanMs: 1100,
      boundaryGuided: true,
    };
    this.surface = { x: 0, y: 0, w: 1, h: 1 };
    this.listeners = new Set();
    this.reset();
  }

  onChange(fn) {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  emit() {
    this.listeners.forEach((fn) => fn(this));
  }

  setSurface(rect) {
    this.surface = { ...rect };
    if (this.active) {
      this.rect = { ...rect };
      this.cells = this.cellsFor(this.rect);
      this.index = Math.min(this.index, this.cells.length - 1);
    }
    this.emit();
  }

  reset() {
    this.active = false;
    this.done = false;
    this.level = 0;
    this.activations = 0;
    this.index = 0;
    this.rect = { ...this.surface };
    this.cells = [];
    this.path = [];
    this.coordinate = null;
    this.emit();
  }

  start() {
    this.reset();
    this.active = true;
    this.rect = { ...this.surface };
    this.cells = this.cellsFor(this.rect);
    this.log.add('switch', 'Switch selection started — complete screen subdivided into four regions', {
      surface: this.surface,
      depth: this.config.depth,
    });
    this.emit();
  }

  // The four child regions of a rectangle. Boundary lines from the referential
  // map take precedence over the geometric midpoint when they fall inside.
  cellsFor(rect) {
    const midX = rect.x + rect.w / 2;
    const midY = rect.y + rect.h / 2;
    let sx = midX;
    let sy = midY;
    if (this.config.boundaryGuided && this.map) {
      const b = this.map.boundaries();
      const vCandidates = b.vertical.filter((x) => x > rect.x + rect.w * 0.16 && x < rect.x + rect.w * 0.84);
      const hCandidates = b.horizontal.filter((y) => y > rect.y + rect.h * 0.16 && y < rect.y + rect.h * 0.84);
      if (vCandidates.length) {
        sx = vCandidates.reduce((best, x) => (Math.abs(x - midX) < Math.abs(best - midX) ? x : best), vCandidates[0]);
      }
      if (hCandidates.length) {
        sy = hCandidates.reduce((best, y) => (Math.abs(y - midY) < Math.abs(best - midY) ? y : best), hCandidates[0]);
      }
    }
    return [
      { x: rect.x, y: rect.y, w: sx - rect.x, h: sy - rect.y, quadrant: 'top-left' },
      { x: sx, y: rect.y, w: rect.x + rect.w - sx, h: sy - rect.y, quadrant: 'top-right' },
      { x: rect.x, y: sy, w: sx - rect.x, h: rect.y + rect.h - sy, quadrant: 'bottom-left' },
      { x: sx, y: sy, w: rect.x + rect.w - sx, h: rect.y + rect.h - sy, quadrant: 'bottom-right' },
    ];
  }

  advance() {
    if (!this.active) return { ok: false, reason: 'selection not active' };
    this.index = (this.index + 1) % this.cells.length;
    this.emit();
    return { ok: true, index: this.index, quadrant: this.cells[this.index].quadrant };
  }

  select() {
    if (!this.active) return { ok: false, reason: 'selection not active' };
    const cell = this.cells[this.index];
    if (!cell) return { ok: false, reason: 'no highlighted region' };
    this.activations += 1;

    if (this.level >= this.config.depth) {
      const center = rectCenter(cell);
      const { w, h } = this.surface;
      const xMm = (center.x / w) * this.cal.get('screen.widthMm') - this.cal.get('screen.widthMm') / 2;
      const yMm = (center.y / h) * this.cal.get('screen.heightMm') - this.cal.get('screen.heightMm') / 2;
      const xPx = (center.x / w) * this.cal.get('screen.widthPx');
      const yPx = (center.y / h) * this.cal.get('screen.heightPx');
      this.coordinate = {
        xSurface: center.x,
        ySurface: center.y,
        xMm,
        yMm,
        xPx,
        yPx,
        region: cell,
        cellWidthMm: (cell.w / w) * this.cal.get('screen.widthMm'),
        cellHeightMm: (cell.h / h) * this.cal.get('screen.heightMm'),
      };
      this.active = false;
      this.done = true;
      this.log.add('switch', 'Coordinate resolved — final activation clicks the selected position', {
        activations: this.activations,
        xMm: Math.round(xMm),
        yMm: Math.round(yMm),
        cellWidthMm: Math.round(this.coordinate.cellWidthMm * 10) / 10,
      });
      this.onActivate?.(this.coordinate);
      this.emit();
      return { ok: true, final: true, coordinate: this.coordinate };
    }

    this.path.push({ level: this.level, quadrant: cell.quadrant, rect: { ...cell } });
    this.rect = { ...cell };
    this.level += 1;
    this.cells = this.cellsFor(cell);
    this.index = 0;
    this.log.add('switch', `Subdivision level ${this.level} — ${cell.quadrant} selected`, {
      level: this.level,
      quadrant: cell.quadrant,
      childCells: this.cells.length,
    });
    this.emit();
    return { ok: true, final: false, rect: cell, level: this.level };
  }

  status() {
    return {
      active: this.active,
      done: this.done,
      level: this.level,
      depth: this.config.depth,
      index: this.index,
      cells: this.cells,
      rect: this.rect,
      path: this.path,
      activations: this.activations,
      coordinate: this.coordinate,
      mode: this.config.mode,
      boundaryGuided: this.config.boundaryGuided,
    };
  }
}
