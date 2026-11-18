// Gesture laboratory — configurable spatial-temporal definitions, recognition
// sequences, state transitions and the dwell / click arbitration.

import { DEFAULT_GESTURES, DIRECTIONS } from '../core/gestures.js';
import { REGION_DEFS } from '../core/referentialMap.js';
import { clamp, fmt, label, marker, setupCanvas } from '../core/util.js';
import {
  badge,
  btn,
  clear,
  h,
  panel,
  sectionGrid,
} from './dom.js';

const PHASE_TONE = {
  idle: 'muted',
  dwell: 'accent',
  armed: 'warn',
  seq1: 'accent',
  seq2: 'accent',
  seq2dwell: 'accent',
  cooldown: 'muted',
};

export function mountGesture(root, app) {
  const { gestures: recognizer, log } = app;
  const canvas = h('canvas', { class: 'gesture-canvas', id: 'gesture-surface' });
  const phaseRow = h('div', { class: 'phase-row' });
  const eventList = h('ul', { class: 'event-mini' });
  const pendingLine = h('p', { class: 'mono' }, 'No pending click.');
  const defBody = h('tbody');
  const gazeLine = h('p', { class: 'mono muted' }, 'Move the pointer over the surface to drive the eye finger.');

  let lastGaze = null;
  let lastFeed = 0;
  let demoing = false;
  let flash = null;
  const trail = [];

  function surfacePoint(event) {
    const rect = canvas.getBoundingClientRect();
    return { x: event.clientX - rect.left, y: event.clientY - rect.top };
  }

  function feed(x, y, blink = false) {
    const t = performance.now();
    lastGaze = { x, y };
    trail.push({ x, y });
    if (trail.length > 60) trail.shift();
    recognizer.observe({ t, x, y, blink });
  }

  canvas.addEventListener('pointermove', (event) => {
    if (demoing) return;
    const p = surfacePoint(event);
    feed(p.x, p.y);
    lastFeed = performance.now();
  });

  canvas.addEventListener('pointerdown', (event) => {
    if (demoing) return;
    event.preventDefault();
    const p = surfacePoint(event);
    feed(p.x, p.y, true);
    lastFeed = performance.now();
    flash = { text: 'blink', at: performance.now() };
  });

  document.addEventListener('keydown', (event) => {
    if (event.key.toLowerCase() !== 'b' || root.offsetParent === null || !lastGaze) return;
    event.preventDefault();
    feed(lastGaze.x, lastGaze.y, true);
    flash = { text: 'blink', at: performance.now() };
  });

  function demoSteps(def) {
    const steps = [];
    const push = (x, y, dt = 30, blink = false) => steps.push({ x, y, dt, blink });
    const hold = (p, ms, blink = false) => {
      for (let i = 0; i < Math.ceil(ms / 30) + 6; i += 1) push(p.x, p.y, 30, blink && i === Math.ceil(ms / 30) + 5);
    };

    if (def.id === 'resume') {
      const pauseZone = recognizer.regionCenterPx('pauseZone');
      const centre = recognizer.regionCenterPx('center');
      hold(pauseZone, 700);
      for (let i = 1; i <= 6; i += 1) {
        push(pauseZone.x + ((centre.x - pauseZone.x) * i) / 6, pauseZone.y + ((centre.y - pauseZone.y) * i) / 6);
      }
      hold(centre, def.dwellMs + 120);
      return steps;
    }

    if (def.type === 'sequence-move') {
      const a = recognizer.regionCenterPx(def.sequence[0]);
      const b = recognizer.regionCenterPx(def.sequence[1]);
      hold(a, def.dwellMs + 120);
      for (let i = 1; i <= 6; i += 1) push(a.x + ((b.x - a.x) * i) / 6, a.y + ((b.y - a.y) * i) / 6);
      hold(b, def.dwellMs + 120);
      const dx = def.direction === 'left' ? -20 : def.direction === 'right' ? 20 : 0;
      const dy = def.direction === 'up' ? -20 : def.direction === 'down' ? 20 : 0;
      for (let i = 1; i <= 8; i += 1) push(b.x + dx * i, b.y + dy * i);
      return steps;
    }

    if (def.type === 'dwell-look') {
      const start = recognizer.regionCenterPx('center');
      hold(start, def.dwellMs + 120);
      for (let i = 1; i <= 8; i += 1) push(start.x + 20 * i, start.y);
      return steps;
    }

    const start = recognizer.regionCenterPx(def.startRegion === 'any' ? 'center' : def.startRegion);
    hold(start, def.dwellMs + 120);
    if (def.type === 'dwell-blink') {
      push(start.x, start.y, 30, true);
      return steps;
    }
    if (def.type === 'dwell-action') return steps;
    const dx = def.direction === 'left' ? -22 : def.direction === 'right' ? 22 : 0;
    const dy = def.direction === 'up' ? -22 : def.direction === 'down' ? 22 : 0;
    const stepsCount = def.crossCentre ? 14 : 10;
    for (let i = 1; i <= stepsCount; i += 1) push(start.x + dx * i, start.y + dy * i);
    return steps;
  }

  function playDemo(def) {
    if (demoing) return;
    recognizer.resetTrackers();
    recognizer.setPaused(false);
    demoing = true;
    gazeLine.textContent = `Playing demonstration for "${def.label}"…`;
    const steps = demoSteps(def);
    let i = 0;
    const timer = setInterval(() => {
      const step = steps[i];
      if (!step) {
        clearInterval(timer);
        demoing = false;
        gazeLine.textContent = `Demonstration for "${def.label}" complete.`;
        return;
      }
      feed(step.x, step.y, step.blink);
      i += 1;
    }, 30);
  }

  function buildDefinitionRows() {
    clear(defBody);
    for (const def of recognizer.definitions) {
      const dwell = h('input', { type: 'number', class: 'num small', min: 80, max: 3000, step: 20, value: def.dwellMs });
      dwell.addEventListener('change', () => recognizer.updateDefinition(def.id, { dwellMs: Number(dwell.value) }));
      const tolerance = h('input', { type: 'number', class: 'num small', min: 10, max: 400, step: 5, value: def.tolerancePx });
      tolerance.addEventListener('change', () => recognizer.updateDefinition(def.id, { tolerancePx: Number(tolerance.value) }));
      const travel = h('input', { type: 'number', class: 'num small', min: 20, max: 600, step: 10, value: def.minTravelPx ?? 0 });
      travel.addEventListener('change', () => recognizer.updateDefinition(def.id, { minTravelPx: Number(travel.value) }));
      const dir = h(
        'select',
        { class: 'select small' },
        ...['any', ...DIRECTIONS].map((d) => h('option', { value: d, selected: (def.direction || 'any') === d }, d)),
      );
      dir.addEventListener('change', () => recognizer.updateDefinition(def.id, { direction: dir.value }));
      const enabled = h('input', { type: 'checkbox', checked: def.enabled });
      enabled.addEventListener('change', () => recognizer.updateDefinition(def.id, { enabled: enabled.checked }));

      defBody.appendChild(
        h(
          'tr',
          {},
          h('td', {}, h('strong', {}, def.label), h('div', { class: 'muted small-text' }, def.description)),
          h('td', { class: 'mono' }, def.startRegion || (def.sequence ? def.sequence.join(' → ') : 'any')),
          h('td', {}, dwell),
          h('td', {}, tolerance),
          h('td', {}, travel),
          h('td', {}, dir),
          h('td', {}, enabled),
          h('td', {}, btn('Demo', () => playDemo(def), { variant: 'ghost', id: `demo-${def.id}` })),
        ),
      );
    }
  }

  function draw() {
    if (root.offsetParent === null) return;
    const { ctx, w, h } = setupCanvas(canvas);
    if (w < 40) return;
    ctx.fillStyle = '#0a0f14';
    ctx.fillRect(0, 0, w, h);

    if (recognizer.surface.w !== w || recognizer.surface.h !== h) {
      recognizer.setSurface(w, h);
      recognizer.setRegions(REGION_DEFS);
    }

    for (const region of recognizer.regions) {
      const { px } = region;
      ctx.save();
      ctx.strokeStyle = region.layer === 'navigation' ? 'rgba(167,139,250,0.35)' : region.layer === 'quadrant' ? 'rgba(120,150,175,0.18)' : 'rgba(76,201,224,0.35)';
      ctx.setLineDash(region.layer === 'quadrant' ? [2, 5] : []);
      ctx.strokeRect(px.x, px.y, px.w, px.h);
      ctx.restore();
      label(ctx, region.id, px.x + 5, px.y + 10, 'rgba(150,175,195,0.6)', 'left', 9);
    }

    if (trail.length > 1) {
      ctx.save();
      ctx.strokeStyle = 'rgba(240,180,94,0.3)';
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      trail.forEach((p, i) => (i === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y)));
      ctx.stroke();
      ctx.restore();
    }

    if (lastGaze) {
      marker(ctx, clamp(lastGaze.x, 0, w), clamp(lastGaze.y, 0, h), '#f0b45e', 6, 'circle', true);
      const region = recognizer.regionAt(lastGaze.x, lastGaze.y);
      label(ctx, region || 'no named region', lastGaze.x + 10, lastGaze.y - 8, 'rgba(240,180,94,0.85)', 'left', 9);
    }

    if (recognizer.pendingClick) {
      const p = recognizer.pendingClick;
      ctx.save();
      ctx.setLineDash([4, 4]);
      ctx.strokeStyle = 'rgba(110,231,168,0.8)';
      ctx.beginPath();
      ctx.arc(p.x, p.y, 14, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
      label(ctx, 'click pending', p.x, p.y + 26, 'rgba(110,231,168,0.9)', 'center', 9);
    }

    if (flash) {
      const age = performance.now() - flash.at;
      if (age > 500) flash = null;
      else label(ctx, flash.text, w / 2, 16, `rgba(240,180,94,${1 - age / 500})`, 'center', 11);
    }

    label(ctx, 'pointer = gaze · click or B = blink', 10, h - 10, 'rgba(130,155,175,0.75)');
  }

  function updatePanels() {
    clear(phaseRow);
    for (const row of recognizer.phaseRows()) {
      phaseRow.appendChild(
        h(
          'span',
          { class: 'phase-chip' },
          h('strong', {}, row.label),
          badge(row.phaseLabel, PHASE_TONE[row.phase] || 'muted'),
        ),
      );
    }

    const pending = recognizer.pendingClick;
    pendingLine.textContent = pending
      ? `Click pending at ${Math.round(pending.x)}, ${Math.round(pending.y)} — resolved by blink, look-away or claimed by a gesture.`
      : `No pending click. ${recognizer.paused ? 'Eye finger paused by gesture.' : ''}`;

    clear(eventList);
    const recent = recognizer.events.slice(-12).reverse();
    if (!recent.length) eventList.appendChild(h('li', { class: 'muted' }, 'No recognition events yet.'));
    recent.forEach((e) => {
      eventList.appendChild(
        h(
          'li',
          {},
          h('span', { class: 'mono muted' }, new Date(e.at).toLocaleTimeString([], { hour12: false })),
          badge(e.kind, e.kind === 'recognized' ? 'good' : e.kind === 'cancelled' ? 'bad' : 'accent'),
          h('span', {}, e.message),
        ),
      );
    });
  }

  recognizer.onChange(updatePanels);
  buildDefinitionRows();

  root.appendChild(
    sectionGrid(
      panel(
        'Gesture surface',
        'Named regions guide interpretation. A dwell that begins a gesture does not also produce a click.',
        canvas,
        h('div', { class: 'btn-row' },
          btn('Blink', () => {
            if (!lastGaze) lastGaze = { x: 200, y: 200 };
            feed(lastGaze.x, lastGaze.y, true);
          }, { id: 'gesture-blink' }),
          btn('Reset recognizer', () => { recognizer.reset(); trail.length = 0; }, { id: 'gesture-reset' })),
        pendingLine,
        gazeLine,
      ),
      panel('Recognition state', 'Live phase per definition.', phaseRow),
      panel(
        'Gesture definitions',
        'Starting position, tolerance, dwell duration, direction, destination, completion and cancellation.',
        h(
          'table',
          { class: 'data-table' },
          h('thead', {}, h('tr', {}, h('th', {}, 'Gesture'), h('th', {}, 'Start'), h('th', {}, 'Dwell ms'), h('th', {}, 'Tolerance px'), h('th', {}, 'Travel px'), h('th', {}, 'Direction'), h('th', {}, 'On'), h('th', {}, ''))),
          defBody,
        ),
      ),
      panel('Recognition sequence', 'Armed, claimed, recognised and cancelled events.', eventList),
    ),
  );

  updatePanels();

  return {
    onShow() {
      const rect = canvas.getBoundingClientRect();
      if (rect.width > 10) {
        recognizer.setSurface(rect.width, rect.height);
        recognizer.setRegions(REGION_DEFS);
      }
      draw();
      updatePanels();
    },
    tick() {
      if (root.offsetParent === null) return;
      const now = performance.now();
      if (!demoing && lastGaze && now - lastFeed > 50) {
        lastFeed = now;
        recognizer.observe({ t: now, x: lastGaze.x, y: lastGaze.y });
      }
      draw();
      updatePanels();
    },
  };
}
