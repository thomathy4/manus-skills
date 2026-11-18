// Section 5 — eye gesture recognition.
//
// Definitions are data: start region, spatial tolerance, dwell duration,
// movement direction, destination, completion and cancellation conditions.
// A dwell that is the beginning of a gesture claims the click it would
// otherwise have produced, so ordinary dwell clicks and gesture dwells are
// never confused.

import { clamp, distance } from './util.js';

export const DIRECTIONS = ['up', 'down', 'left', 'right'];

export const DEFAULT_GESTURES = [
  {
    id: 'carousel',
    label: 'Carousel',
    type: 'dwell-move',
    description: 'Centre gaze · brief dwell · upward movement',
    startRegion: 'center',
    dwellMs: 520,
    tolerancePx: 70,
    direction: 'up',
    minTravelPx: 130,
    destinationRegion: null,
    windowMs: 1600,
    action: 'carousel',
    enabled: true,
  },
  {
    id: 'notifications',
    label: 'Notifications panel',
    type: 'dwell-move',
    description: 'Top-of-screen gaze · brief dwell · return to centre',
    startRegion: 'top',
    dwellMs: 520,
    tolerancePx: 90,
    direction: 'down',
    minTravelPx: 120,
    destinationRegion: 'center',
    windowMs: 2200,
    action: 'notifications',
    enabled: true,
  },
  {
    id: 'lookAwayClick',
    label: 'Look-away click',
    type: 'dwell-look',
    description: 'Gaze at a point, then look away → click the original point',
    startRegion: 'any',
    dwellMs: 450,
    tolerancePx: 48,
    minTravelPx: 90,
    action: 'click-origin',
    enabled: true,
  },
  {
    id: 'contextHold',
    label: 'Context / long press',
    type: 'dwell-blink',
    description: 'Gaze at a point, hold, then blink → context interaction',
    startRegion: 'any',
    dwellMs: 800,
    tolerancePx: 48,
    windowMs: 6000,
    action: 'context',
    enabled: true,
  },
  {
    id: 'back',
    label: 'Back gesture',
    type: 'dwell-move',
    description: 'Centre-right dwell · movement past centre → backward',
    startRegion: 'centerRight',
    dwellMs: 480,
    tolerancePx: 80,
    direction: 'left',
    minTravelPx: 110,
    crossCentre: true,
    windowMs: 1800,
    action: 'back',
    enabled: true,
  },
  {
    id: 'forward',
    label: 'Forward gesture',
    type: 'dwell-move',
    description: 'Centre-left dwell · movement past centre → forward',
    startRegion: 'centerLeft',
    dwellMs: 480,
    tolerancePx: 80,
    direction: 'right',
    minTravelPx: 110,
    crossCentre: true,
    windowMs: 1800,
    action: 'forward',
    enabled: true,
  },
  {
    id: 'zoomOut',
    label: 'Zoom out',
    type: 'sequence-move',
    description: 'Opposite quadrant centre dwells · movement left → incremental zoom out',
    sequence: ['q1', 'q3'],
    dwellMs: 420,
    tolerancePx: 90,
    direction: 'left',
    minTravelPx: 100,
    sequenceTimeoutMs: 3200,
    action: 'zoom-out',
    enabled: true,
  },
  {
    id: 'zoomIn',
    label: 'Zoom in',
    type: 'sequence-move',
    description: 'Opposite quadrant centre dwells · movement right → incremental zoom in',
    sequence: ['q1', 'q3'],
    dwellMs: 420,
    tolerancePx: 90,
    direction: 'right',
    minTravelPx: 100,
    sequenceTimeoutMs: 3200,
    action: 'zoom-in',
    enabled: true,
  },
  {
    id: 'pause',
    label: 'Pause',
    type: 'dwell-action',
    description: 'Dwell in the pause zone → pause the active finger',
    startRegion: 'pauseZone',
    dwellMs: 600,
    tolerancePx: 60,
    action: 'pause',
    suppressClick: true,
    enabled: true,
  },
  {
    id: 'resume',
    label: 'Resume',
    type: 'dwell-action',
    description: 'Brief dwell after a pause → resume the active finger',
    startRegion: 'any',
    excludeRegion: 'pauseZone',
    dwellMs: 220,
    tolerancePx: 60,
    action: 'resume',
    suppressClick: true,
    onlyWhenPaused: true,
    enabled: true,
  },
];

const PHASE_LABEL = {
  idle: 'idle',
  dwell: 'dwelling',
  armed: 'armed',
  seq1: 'first dwell',
  seq2: 'awaiting opposite dwell',
  seq2dwell: 'second dwell',
  cooldown: 'cooldown',
};

export class GestureRecognizer {
  constructor({ log, engine, fingerId = 'eye-left' }) {
    this.log = log;
    this.engine = engine;
    this.fingerId = fingerId;
    this.definitions = DEFAULT_GESTURES.map((d) => ({ ...d }));
    this.regions = [];
    this.surface = { w: 1000, h: 560 };
    this.trackers = [];
    this.events = [];
    this.seq = 0;
    this.pendingClick = null;
    this.lastBlinkAt = 0;
    this.listeners = new Set();
    this.paused = false;
    this.lastSample = null;
    this.reset();
  }

  onChange(fn) {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  emit() {
    this.listeners.forEach((fn) => fn(this));
  }

  setSurface(w, h) {
    this.surface = { w, h };
  }

  setRegions(regions) {
    this.regions = regions.map((r) => ({
      ...r,
      px: {
        x: r.rect.x * this.surface.w,
        y: r.rect.y * this.surface.h,
        w: r.rect.w * this.surface.w,
        h: r.rect.h * this.surface.h,
      },
    }));
  }

  setDefinitions(defs) {
    this.definitions = defs.map((d) => ({ ...d }));
    this.reset();
  }

  updateDefinition(id, patch) {
    const def = this.definitions.find((d) => d.id === id);
    if (!def) return;
    Object.assign(def, patch);
    this.reset();
    this.log.add('gesture', `Gesture definition updated: ${def.label}`, { id, patch });
  }

  reset() {
    this.resetTrackers();
    this.setPaused(false);
  }

  resetTrackers() {
    this.trackers = this.definitions
      .filter((d) => d.type !== 'dwell-look')
      .map((def) => ({
        def,
        phase: 'idle',
        anchor: null,
        since: 0,
        armedAt: 0,
        seqAt: 0,
        secondAnchor: null,
      }));
    this.pendingClick = null;
    this.emit();
  }

  regionAt(x, y) {
    let best = null;
    for (const r of this.regions) {
      const { px } = r;
      if (x >= px.x && x <= px.x + px.w && y >= px.y && y <= px.y + px.h) {
        if (!best || px.w * px.h < best.px.w * best.px.h) best = r;
      }
    }
    return best ? best.id : null;
  }

  regionCenterPx(id) {
    const r = this.regions.find((reg) => reg.id === id);
    if (!r) return { x: this.surface.w / 2, y: this.surface.h / 2 };
    return { x: r.px.x + r.px.w / 2, y: r.px.y + r.px.h / 2 };
  }

  record(kind, def, message, extra = {}) {
    this.seq += 1;
    const entry = {
      id: this.seq,
      at: Date.now(),
      kind,
      gestureId: def ? def.id : null,
      label: def ? def.label : null,
      message,
      ...extra,
    };
    this.events.push(entry);
    if (this.events.length > 120) this.events.shift();
    this.log.add('gesture', message, {
      kind,
      gestureId: entry.gestureId,
      ...extra,
    });
    this.emit();
    return entry;
  }

  setPaused(value) {
    this.paused = value;
    this.engine.setGestureState(this.fingerId, value ? 'paused-by-gesture' : 'none');
  }

  directionMatches(dxPx, dyPx, direction, minTravelPx) {
    const ax = Math.abs(dxPx);
    const ay = Math.abs(dyPx);
    switch (direction) {
      case 'up':
        return dyPx <= -minTravelPx && ay >= ax * 0.5;
      case 'down':
        return dyPx >= minTravelPx && ay >= ax * 0.5;
      case 'left':
        return dxPx <= -minTravelPx && ax >= ay * 0.5;
      case 'right':
        return dxPx >= minTravelPx && ax >= ay * 0.5;
      default:
        return Math.hypot(dxPx, dyPx) >= minTravelPx;
    }
  }

  oppositeDirectionMatches(dxPx, dyPx, direction) {
    switch (direction) {
      case 'up':
        return dyPx > 0 && Math.abs(dyPx) > Math.abs(dxPx);
      case 'down':
        return dyPx < 0 && Math.abs(dyPx) > Math.abs(dxPx);
      case 'left':
        return dxPx > 0 && Math.abs(dxPx) > Math.abs(dyPx);
      case 'right':
        return dxPx < 0 && Math.abs(dxPx) > Math.abs(dyPx);
      default:
        return false;
    }
  }

  startRegionMatches(def, regionId) {
    if (def.excludeRegion && regionId === def.excludeRegion) return false;
    if (def.startRegion === 'any') return true;
    return regionId === def.startRegion;
  }

  observe(sample) {
    const t = sample.t;
    const x = sample.x;
    const y = sample.y;
    const blink = Boolean(sample.blink);
    this.lastSample = { x, y, t };
    const regionId = this.regionAt(x, y);
    const pendingBefore = this.pendingClick;

    for (const tr of this.trackers) {
      const def = tr.def;
      if (!def.enabled) continue;
      // While the eye finger is paused, only the resume gesture is interpreted.
      if (this.paused && def.action !== 'resume') continue;
      const tol = def.tolerancePx;
      const inStart = this.startRegionMatches(def, regionId);

      if (tr.phase === 'cooldown') {
        if (t - tr.armedAt > 450) tr.phase = 'idle';
        continue;
      }

      if (def.type === 'sequence-move') {
        this.observeSequence(tr, x, y, t, regionId);
        continue;
      }

      if (tr.phase === 'idle') {
        if (inStart && this.resumeGateOpen(def)) {
          tr.phase = 'dwell';
          tr.anchor = { x, y };
          tr.since = t;
        }
        continue;
      }

      if (tr.phase === 'dwell') {
        if (distance({ x, y }, tr.anchor) > tol) {
          tr.phase = 'idle';
          tr.anchor = null;
          continue;
        }
        if (t - tr.since >= def.dwellMs) {
          tr.phase = 'armed';
          tr.armedAt = t;
          this.record('armed', def, `${def.label} armed — dwell complete at (${Math.round(x)}, ${Math.round(y)})`, {
            phase: 'armed',
            x: Math.round(x),
            y: Math.round(y),
          });
          if (!def.suppressClick) this.armPendingClick(tr.anchor, def, t);
          if (def.type === 'dwell-action' && def.action === 'pause') {
            this.complete(def, tr.anchor, t);
            continue;
          }
        }
        continue;
      }

      if (tr.phase === 'armed') {
        const dx = x - tr.anchor.x;
        const dy = y - tr.anchor.y;
        const moved = Math.hypot(dx, dy);

        if (def.type === 'dwell-blink') {
          if (blink) {
            this.complete(def, tr.anchor, t);
            continue;
          }
          if (moved > tol) {
            this.cancel(def, 'moved away before the blink', t);
            tr.phase = 'idle';
          } else if (t - tr.armedAt > (def.windowMs || 6000)) {
            this.cancel(def, 'hold window elapsed', t);
            tr.phase = 'idle';
          }
          continue;
        }

        if (def.type === 'dwell-action' && def.action === 'resume') {
          this.complete(def, { x, y }, t);
          continue;
        }

        if (this.directionMatches(dx, dy, def.direction, def.minTravelPx)) {
          if (def.crossCentre) {
            const crossed =
              def.direction === 'left'
                ? x <= this.surface.w * 0.5
                : def.direction === 'right'
                  ? x >= this.surface.w * 0.5
                  : def.direction === 'up'
                    ? y <= this.surface.h * 0.5
                    : y >= this.surface.h * 0.5;
            if (!crossed) {
              if (moved > def.minTravelPx * 2.6) {
                this.cancel(def, 'movement did not cross the centre line', t);
                tr.phase = 'idle';
              }
              continue;
            }
          }
          if (def.destinationRegion && this.regionAt(x, y) !== def.destinationRegion) {
            // Keep waiting for the destination, but cancel on overshoot.
            if (moved > def.minTravelPx * 2.2) {
              this.cancel(def, `destination "${def.destinationRegion}" not reached`, t);
              tr.phase = 'idle';
            }
            continue;
          }
          this.complete(def, tr.anchor, t);
          continue;
        }

        if (this.oppositeDirectionMatches(dx, dy, def.direction)) {
          this.cancel(def, 'movement in the opposite direction', t);
          tr.phase = 'idle';
          continue;
        }

        if (t - tr.armedAt > (def.windowMs || 1600)) {
          this.cancel(def, 'no qualifying movement after the dwell', t);
          tr.phase = 'idle';
        }
      }
    }

    // A blink that no gesture claimed resolves the pending dwell click.
    if (blink && pendingBefore && this.pendingClick === pendingBefore) {
      this.pendingClick = null;
      this.emitClick(pendingBefore.x, pendingBefore.y, 'dwell + blink', t);
      this.resetArmed();
    }

    // Look-away click: dwell at a point, then leave it without any gesture
    // claiming the dwell.
    if (this.pendingClick) {
      const p = this.pendingClick;
      const moved = Math.hypot(x - p.x, y - p.y);
      const def = this.definitions.find((d) => d.type === 'dwell-look');
      // A movement that follows the direction of an armed gesture belongs to
      // that gesture, not to the ordinary look-away click.
      const claimedByDirection = this.trackers.some((tr) => {
        if (tr.phase !== 'armed' || !tr.anchor) return false;
        if (tr.def.type !== 'dwell-move' && tr.def.type !== 'sequence-move') return false;
        const dx = x - tr.anchor.x;
        const dy = y - tr.anchor.y;
        if (Math.hypot(dx, dy) < 8) return true;
        return this.directionMatches(dx, dy, tr.def.direction, 24);
      });
      if (moved > (def?.minTravelPx ?? 90) && !claimedByDirection) {
        this.pendingClick = null;
        this.emitClick(p.x, p.y, 'look-away', t);
        this.resetArmed();
      } else if (t - p.since > 5000) {
        this.pendingClick = null;
        this.record('cancelled', def, 'Dwell click expired — no blink and no look-away', { phase: 'expired' });
      }
    }

    if (blink) this.lastBlinkAt = t;
    this.emit();
  }

  resumeGateOpen(def) {
    if (!def.onlyWhenPaused) return true;
    return this.paused;
  }

  observeSequence(tr, x, y, t, regionId) {
    const def = tr.def;
    const tol = def.tolerancePx;
    if (tr.phase === 'idle') {
      if (regionId === def.sequence[0]) {
        tr.phase = 'seq1';
        tr.anchor = { x, y };
        tr.since = t;
      }
      return;
    }
    if (tr.phase === 'seq1') {
      if (distance({ x, y }, tr.anchor) > tol) {
        tr.phase = 'idle';
        return;
      }
      if (t - tr.since >= def.dwellMs) {
        tr.phase = 'seq2';
        tr.seqAt = t;
        this.record('phase', def, `${def.label}: first quadrant dwell complete — awaiting opposite quadrant`, {
          phase: 'awaiting-opposite',
        });
      }
      return;
    }
    if (tr.phase === 'seq2') {
      if (t - tr.seqAt > (def.sequenceTimeoutMs || 3200)) {
        this.cancel(def, 'opposite quadrant dwell did not follow', t);
        tr.phase = 'idle';
        return;
      }
      if (regionId === def.sequence[1]) {
        tr.phase = 'seq2dwell';
        tr.secondAnchor = { x, y };
        tr.since = t;
      }
      return;
    }
    if (tr.phase === 'seq2dwell') {
      if (regionId !== def.sequence[1] || distance({ x, y }, tr.secondAnchor) > tol) {
        tr.phase = 'seq2';
        return;
      }
      if (t - tr.since >= def.dwellMs) {
        tr.phase = 'armed';
        tr.armedAt = t;
        tr.anchor = tr.secondAnchor;
        this.record('armed', def, `${def.label} armed — opposite quadrant dwells complete`, { phase: 'armed' });
        this.armPendingClick(tr.anchor, def, t);
      }
      return;
    }
    if (tr.phase === 'armed') {
      const dx = x - tr.anchor.x;
      const dy = y - tr.anchor.y;
      if (this.directionMatches(dx, dy, def.direction, def.minTravelPx)) {
        this.complete(def, tr.anchor, t);
        return;
      }
      if (t - tr.armedAt > (def.windowMs || 1800)) {
        this.cancel(def, 'no qualifying movement after the dwells', t);
        tr.phase = 'idle';
      }
    }
  }

  armPendingClick(anchor, def, t) {
    if (this.pendingClick) return;
    this.pendingClick = { x: anchor.x, y: anchor.y, since: t, gestureId: def.id };
    this.record('pending-click', def, 'Dwell complete — click pending until blink, look-away or gesture', {
      phase: 'pending-click',
      x: Math.round(anchor.x),
      y: Math.round(anchor.y),
    });
  }

  resetArmed() {
    for (const tr of this.trackers) {
      if (tr.phase === 'armed') {
        tr.phase = 'cooldown';
        tr.armedAt = performance.now();
      }
    }
  }

  emitClick(x, y, via, t) {
    this.engine.dispatch(this.fingerId, 'click', {
      x,
      y,
      t,
      source: 'eye',
      confidence: 0.78,
      provenance: ['eye-tracking', 'simulated', `click:${via}`],
      target: { x, y, via },
    });
    this.record('click', null, `Eye click at (${Math.round(x)}, ${Math.round(y)}) — ${via}`, {
      x: Math.round(x),
      y: Math.round(y),
      via,
    });
  }

  complete(def, anchor, t) {
    const tr = this.trackers.find((x) => x.def.id === def.id);
    if (tr) {
      tr.phase = 'cooldown';
      tr.armedAt = t;
    }
    if (this.pendingClick) {
      this.record('claimed', def, `Dwell claimed by "${def.label}" — no ordinary click emitted`, {
        phase: 'claimed',
        gestureId: def.id,
      });
      this.pendingClick = null;
    }
    this.applyAction(def, anchor, t);
    this.record('recognized', def, `Gesture recognised: ${def.label}`, {
      phase: 'recognized',
      action: def.action,
      x: Math.round(anchor.x),
      y: Math.round(anchor.y),
    });
  }

  cancel(def, reason, t) {
    this.record('cancelled', def, `${def.label} cancelled — ${reason}`, { phase: 'cancelled', reason });
  }

  applyAction(def, anchor, t) {
    const base = {
      x: anchor.x,
      y: anchor.y,
      t,
      source: 'eye',
      confidence: 0.82,
      provenance: ['eye-tracking', 'simulated', `gesture:${def.id}`],
    };
    switch (def.action) {
      case 'click-origin':
        this.emitClick(anchor.x, anchor.y, 'look-away', t);
        break;
      case 'context':
        this.engine.dispatch(this.fingerId, 'context', { ...base, target: { x: anchor.x, y: anchor.y } });
        break;
      case 'pause':
        this.setPaused(true);
        this.engine.dispatch(this.fingerId, 'pause', base);
        break;
      case 'resume':
        this.setPaused(false);
        this.engine.dispatch(this.fingerId, 'resume', base);
        break;
      default: {
        // A navigation gesture is an interaction, not a click: the eye finger
        // performs the same contact → move → release sequence a touch swipe
        // would produce.
        const finger = this.engine.get(this.fingerId);
        const end = this.lastSample || anchor;
        if (finger && finger.state === 'idle') {
          this.engine.dispatch(this.fingerId, 'contact', {
            ...base,
            x: anchor.x,
            y: anchor.y,
            provenance: [...base.provenance, `gesture-start:${def.id}`],
          });
          this.engine.dispatch(this.fingerId, 'move', {
            ...base,
            x: end.x,
            y: end.y,
            provenance: [...base.provenance, `gesture-move:${def.id}`],
          });
          this.engine.dispatch(this.fingerId, 'release', {
            ...base,
            x: end.x,
            y: end.y,
            suppressClick: true,
            provenance: [...base.provenance, `gesture-release:${def.id}`],
          });
        }
        this.record('action', def, `Action "${def.action}" dispatched at (${Math.round(anchor.x)}, ${Math.round(anchor.y)})`, {
          action: def.action,
        });
        break;
      }
    }
  }

  phaseRows() {
    return this.trackers.map((tr) => ({
      id: tr.def.id,
      label: tr.def.label,
      phase: tr.phase,
      phaseLabel: PHASE_LABEL[tr.phase] || tr.phase,
      enabled: tr.def.enabled,
      def: tr.def,
    }));
  }

  summary() {
    const recognized = this.events.filter((e) => e.kind === 'recognized');
    return {
      recognized: recognized.length,
      last: recognized.length ? recognized[recognized.length - 1] : null,
      pendingClick: this.pendingClick
        ? { x: Math.round(this.pendingClick.x), y: Math.round(this.pendingClick.y), age: Math.round(performance.now() - this.pendingClick.since) }
        : null,
      paused: this.paused,
      actions: [...new Set(recognized.map((e) => e.label))],
    };
  }
}

export function clampGestureValue(field, value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return null;
  if (field === 'dwellMs') return clamp(n, 80, 3000);
  if (field === 'tolerancePx') return clamp(n, 10, 400);
  if (field === 'minTravelPx') return clamp(n, 20, 600);
  return n;
}
