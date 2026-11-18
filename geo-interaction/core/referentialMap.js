// Section 6 — named boundary-layer referential map.
//
// Distinct but interconnected layers: physical screen boundary, interface
// regions, interactive elements, navigation, text/media, scrollable regions,
// empty areas, subdivision relationships and candidate targets. The map guides
// coordinate refinement and gesture interpretation; it never forces an inferred
// position to snap to the nearest control.

export const REGION_DEFS = [
  { id: 'top', label: 'Top navigation band', layer: 'navigation', rect: { x: 0.02, y: 0.02, w: 0.96, h: 0.16 } },
  { id: 'center', label: 'Centre interaction zone', layer: 'region', rect: { x: 0.35, y: 0.37, w: 0.3, h: 0.26 } },
  { id: 'centerLeft', label: 'Centre-left', layer: 'region', rect: { x: 0.13, y: 0.4, w: 0.17, h: 0.2 } },
  { id: 'centerRight', label: 'Centre-right', layer: 'region', rect: { x: 0.7, y: 0.4, w: 0.17, h: 0.2 } },
  { id: 'q1', label: 'Quadrant top-left', layer: 'quadrant', rect: { x: 0.02, y: 0.02, w: 0.47, h: 0.47 } },
  { id: 'q2', label: 'Quadrant top-right', layer: 'quadrant', rect: { x: 0.51, y: 0.02, w: 0.47, h: 0.47 } },
  { id: 'q3', label: 'Quadrant bottom-left', layer: 'quadrant', rect: { x: 0.02, y: 0.51, w: 0.47, h: 0.47 } },
  { id: 'q4', label: 'Quadrant bottom-right', layer: 'quadrant', rect: { x: 0.51, y: 0.51, w: 0.47, h: 0.47 } },
  { id: 'pauseZone', label: 'Pause zone', layer: 'region', rect: { x: 0.83, y: 0.74, w: 0.15, h: 0.22 } },
];

export const MAP_LAYERS = [
  { id: 'screen', label: 'Screen boundary', color: '#8fa3b8' },
  { id: 'regions', label: 'Interface regions', color: '#4cc9e0' },
  { id: 'interactive', label: 'Interactive elements', color: '#f0b45e' },
  { id: 'navigation', label: 'Navigation regions', color: '#a78bfa' },
  { id: 'textMedia', label: 'Text & media areas', color: '#8ad2a8' },
  { id: 'scrollable', label: 'Scrollable regions', color: '#e78fb3' },
  { id: 'empty', label: 'Empty / unrestricted', color: '#6b7c8f' },
  { id: 'subdivisions', label: 'Subdivision relationships', color: '#f87171' },
  { id: 'candidates', label: 'Candidate targets', color: '#f0b45e' },
];

const LAYER_PRIORITY = ['interactive', 'navigation', 'scrollable', 'textMedia', 'empty', 'region'];

export class ReferentialMap {
  constructor(log) {
    this.log = log;
    this.surface = null;
    this.size = { w: 0, h: 0 };
    this.entries = [];
    this.version = 0;
    this.listeners = new Set();
  }

  onChange(fn) {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  attach(surface) {
    this.surface = surface;
    this.refresh();
  }

  refresh() {
    if (!this.surface) return;
    const base = this.surface.getBoundingClientRect();
    if (base.width < 2 || base.height < 2) return;
    this.size = { w: base.width, h: base.height };
    const entries = [];
    const nodes = this.surface.querySelectorAll(
      '[data-interactive],[data-region],[data-text],[data-scroll],[data-empty],[data-nav]',
    );
    let i = 0;
    nodes.forEach((el) => {
      const r = el.getBoundingClientRect();
      if (r.width < 2 || r.height < 2) return;
      i += 1;
      const rect = { x: r.left - base.left, y: r.top - base.top, w: r.width, h: r.height };
      let layer = 'region';
      if (el.hasAttribute('data-interactive')) layer = 'interactive';
      else if (el.hasAttribute('data-nav')) layer = 'navigation';
      else if (el.hasAttribute('data-scroll')) layer = 'scrollable';
      else if (el.hasAttribute('data-text')) layer = 'textMedia';
      else if (el.hasAttribute('data-empty')) layer = 'empty';
      entries.push({
        id: el.id || el.dataset.name || `element-${i}`,
        label: el.dataset.label || el.getAttribute('aria-label') || (el.textContent || '').trim().slice(0, 42) || el.tagName.toLowerCase(),
        layer,
        rect,
        role: el.tagName.toLowerCase(),
        element: el,
        scrollable: el.hasAttribute('data-scroll') || el.scrollHeight > el.clientHeight + 4,
        interactive: el.hasAttribute('data-interactive'),
        source: 'dom',
      });
    });

    for (const def of REGION_DEFS) {
      entries.push({
        id: def.id,
        label: def.label,
        layer: def.layer,
        rect: {
          x: def.rect.x * this.size.w,
          y: def.rect.y * this.size.h,
          w: def.rect.w * this.size.w,
          h: def.rect.h * this.size.h,
        },
        normalized: def.rect,
        source: 'declared',
      });
    }

    this.entries = entries;
    this.version += 1;
    this.listeners.forEach((fn) => fn(this));
  }

  layers() {
    const out = {};
    for (const layer of MAP_LAYERS) out[layer.id] = [];
    for (const entry of this.entries) {
      if (out[entry.layer]) out[entry.layer].push(entry);
      if (entry.scrollable && out.scrollable && !out.scrollable.includes(entry)) out.scrollable.push(entry);
    }
    out.screen = [{ id: 'screen', label: 'Physical screen boundary', layer: 'screen', rect: { x: 0, y: 0, w: this.size.w, h: this.size.h } }];
    return out;
  }

  // Deepest named region containing a surface-local point.
  regionAt(x, y) {
    let best = null;
    for (const entry of this.entries) {
      if (!['region', 'navigation', 'quadrant'].includes(entry.layer)) continue;
      const { rect } = entry;
      if (x >= rect.x && x <= rect.x + rect.w && y >= rect.y && y <= rect.y + rect.h) {
        if (!best || rect.w * rect.h < best.rect.w * best.rect.h) best = entry;
      }
    }
    return best;
  }

  // Edges of significant elements, used to guide subdivision without
  // restricting selection to existing controls.
  boundaries() {
    const vertical = new Set();
    const horizontal = new Set();
    for (const entry of this.entries) {
      if (!['interactive', 'region', 'navigation', 'scrollable', 'textMedia'].includes(entry.layer)) continue;
      vertical.add(Math.round(entry.rect.x));
      vertical.add(Math.round(entry.rect.x + entry.rect.w));
      horizontal.add(Math.round(entry.rect.y));
      horizontal.add(Math.round(entry.rect.y + entry.rect.h));
    }
    return {
      vertical: [...vertical].sort((a, b) => a - b),
      horizontal: [...horizontal].sort((a, b) => a - b),
    };
  }

  candidateTargets() {
    return this.entries
      .filter((e) => e.layer === 'interactive' || (e.layer === 'region' && !['quadrant'].includes(e.layer)))
      .map((e) => ({
        id: e.id,
        label: e.label,
        layer: e.layer,
        x: e.rect.x + e.rect.w / 2,
        y: e.rect.y + e.rect.h / 2,
      }));
  }

  describe() {
    const counts = {};
    for (const entry of this.entries) counts[entry.layer] = (counts[entry.layer] || 0) + 1;
    return { size: this.size, counts, entries: this.entries.length };
  }
}
