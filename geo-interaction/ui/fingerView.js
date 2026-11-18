// Virtual finger laboratory — two independent eye fingers, physical touch, the
// common state machine, pause/resume gestures and source handover.

import { clamp, fmt, label, line, marker, setupCanvas } from '../core/util.js';
import {
  badge,
  btn,
  clear,
  h,
  panel,
  sectionGrid,
} from './dom.js';

const COLORS = {
  'eye-left': '#f0b45e',
  'eye-right': '#a78bfa',
  touch: '#6ee7a8',
  switch: '#8fa3b8',
};

const ZONES = {
  pause: { x: 0.79, y: 0.08, w: 0.16, h: 0.26, label: 'PAUSE · hold 600 ms' },
  resume: { x: 0.79, y: 0.4, w: 0.16, h: 0.22, label: 'RESUME · hold 220 ms' },
};

const zoneRect = (zone, w, h) => ({
  x: zone.x * w,
  y: zone.y * h,
  w: zone.w * w,
  h: zone.h * h,
});

export function mountFinger(root, app) {
  const { engine, log } = app;
  const canvas = h('canvas', { class: 'pad-canvas', id: 'finger-pad' });
  const tableBody = h('tbody');
  const historyList = h('ul', { class: 'event-mini' });
  const note = h('p', { class: 'mono muted' }, 'Drag a marker, or press anywhere to drive the selected source. Select "Physical touch" to hand an eye interaction over to touch.');

  const eyeNorm = {
    'eye-left': { x: 0.3, y: 0.5 },
    'eye-right': { x: 0.38, y: 0.5 },
  };
  let dragging = null;
  let lastTouch = null;
  let pad = { w: 1, h: 1 };
  const dwell = new Map();
  let frame = 0;

  const fingerSelect = h(
    'select',
    { class: 'select', id: 'finger-select' },
    h('option', { value: 'eye-left' }, 'Eye finger — left'),
    h('option', { value: 'eye-right' }, 'Eye finger — right'),
    h('option', { value: 'touch' }, 'Physical touch'),
  );

  const local = (event) => {
    const rect = canvas.getBoundingClientRect();
    return { x: event.clientX - rect.left, y: event.clientY - rect.top };
  };

  const size = () => {
    const rect = canvas.getBoundingClientRect();
    return { w: Math.max(1, rect.width), h: Math.max(1, rect.height) };
  };

  const toPx = (id) => {
    if (id === 'touch') return lastTouch;
    const n = eyeNorm[id];
    const s = size();
    return n ? { x: n.x * s.w, y: n.y * s.h } : null;
  };

  const zoneAt = (p) => {
    const s = size();
    for (const [id, zone] of Object.entries(ZONES)) {
      const r = zoneRect(zone, s.w, s.h);
      if (p.x >= r.x && p.x <= r.x + r.w && p.y >= r.y && p.y <= r.y + r.h) return id;
    }
    return null;
  };

  const hitEye = (p) => {
    let best = null;
    let bestD = 28;
    for (const id of ['eye-left', 'eye-right']) {
      const pos = toPx(id);
      if (!pos) continue;
      const d = Math.hypot(pos.x - p.x, pos.y - p.y);
      if (d < bestD) {
        bestD = d;
        best = id;
      }
    }
    return best;
  };

  function startEye(id, p) {
    const s = size();
    eyeNorm[id] = { x: p.x / s.w, y: p.y / s.h };
    const finger = engine.get(id);
    if (finger.state === 'idle') {
      engine.dispatch(id, 'contact', {
        ...p,
        source: id,
        confidence: 0.72,
        provenance: ['eye-tracking', 'simulated'],
      });
    } else if (finger.state === 'paused') {
      note.textContent = `${finger.label} is paused — move into the resume zone and hold to resume.`;
    } else {
      engine.dispatch(id, 'move', { ...p, confidence: 0.76 });
    }
  }

  function startTouch(p) {
    lastTouch = p;
    const activeEye = ['eye-left', 'eye-right'].find((id) => engine.get(id).state !== 'idle');
    if (activeEye && engine.get('touch').state === 'idle') {
      const res = engine.handoverInteraction(activeEye, 'touch');
      if (res.ok) {
        note.textContent = 'Eye interaction handed over to physical touch — one continuous contact, no duplicate down event.';
      }
    }
    const finger = engine.get('touch');
    if (finger.state === 'idle') {
      engine.dispatch('touch', 'contact', {
        ...p,
        source: 'touch',
        confidence: 0.95,
        provenance: ['physical-touch', 'simulated'],
      });
    } else {
      engine.dispatch('touch', 'move', { ...p, confidence: 0.95 });
    }
  }

  canvas.addEventListener('pointerdown', (event) => {
    event.preventDefault();
    const p = local(event);
    const hit = hitEye(p);
    if (hit) {
      dragging = hit;
      startEye(hit, p);
    } else if (fingerSelect.value !== 'touch') {
      // Pressing the surface drives the selected input source.
      dragging = fingerSelect.value;
      startEye(fingerSelect.value, p);
    } else {
      dragging = 'touch';
      startTouch(p);
    }
    try {
      canvas.setPointerCapture?.(event.pointerId);
    } catch (err) {
      // Synthetic pointer ids cannot be captured; the listeners still work.
    }
  });

  canvas.addEventListener('pointermove', (event) => {
    if (!dragging) return;
    const p = local(event);
    if (dragging === 'touch') {
      lastTouch = p;
      engine.dispatch('touch', 'move', { ...p, confidence: 0.95 });
    } else {
      const s = size();
      eyeNorm[dragging] = { x: p.x / s.w, y: p.y / s.h };
      engine.dispatch(dragging, 'move', { ...p, confidence: 0.76 });
    }
  });

  canvas.addEventListener('pointerup', () => {
    if (dragging === 'touch' && lastTouch) {
      engine.dispatch('touch', 'release', { ...lastTouch, source: 'touch' });
    }
    dragging = null;
  });

  canvas.addEventListener('pointercancel', () => {
    dragging = null;
  });

  function resetPad() {
    engine.resetAll();
    eyeNorm['eye-left'] = { x: 0.3, y: 0.5 };
    eyeNorm['eye-right'] = { x: 0.38, y: 0.5 };
    lastTouch = null;
    dwell.clear();
    dragging = null;
    note.textContent = 'Fingers reset. Drag a marker, or press anywhere to drive the selected source.';
    draw();
    updatePanels();
  }

  function operation(type) {
    const id = fingerSelect.value;
    const pos = toPx(id) || { x: pad.w * 0.5, y: pad.h * 0.5 };
    const nudge = type === 'move' ? { x: clamp(pos.x + 24, 4, pad.w - 4), y: pos.y } : pos;
    if (type === 'move') {
      if (id !== 'touch') eyeNorm[id] = { x: nudge.x / pad.w, y: nudge.y / pad.h };
      else lastTouch = nudge;
    }
    engine.dispatch(id, type, {
      ...nudge,
      source: id,
      confidence: id === 'touch' ? 0.95 : 0.75,
      provenance: [id === 'touch' ? 'physical-touch' : 'eye-tracking', 'simulated', 'manual-operation'],
    });
  }

  function checkDwellGestures() {
    const now = performance.now();
    for (const id of ['eye-left', 'eye-right', 'touch']) {
      const finger = engine.get(id);
      const raw = toPx(id);
      if (!raw || finger.state === 'idle') {
        dwell.delete(id);
        continue;
      }
      // The gesture is read from the raw input source, because a paused finger
      // deliberately ignores move operations.
      const zone = zoneAt(raw);
      const prev = dwell.get(id);
      if (!prev || Math.hypot(raw.x - prev.x, raw.y - prev.y) > 6 || prev.zone !== zone) {
        dwell.set(id, { x: raw.x, y: raw.y, since: now, zone });
        continue;
      }
      if (zone === 'pause' && (finger.state === 'contact' || finger.state === 'moving') && now - prev.since >= 600) {
        engine.dispatch(id, 'pause', { ...raw, source: finger.source });
        log.add('finger', `Pause gesture — 600 ms dwell in the pause zone (${finger.source})`, {
          fingerId: id,
          source: finger.source,
          gesture: 'pause',
          dwellMs: 600,
        });
        dwell.set(id, { ...raw, since: now, zone });
      } else if (zone === 'resume' && finger.state === 'paused' && now - prev.since >= 220) {
        engine.dispatch(id, 'resume', { ...raw, source: finger.source });
        log.add('finger', `Resume gesture — 220 ms dwell in the resume zone (${finger.source})`, {
          fingerId: id,
          source: finger.source,
          gesture: 'resume',
          dwellMs: 220,
        });
        dwell.set(id, { ...raw, since: now, zone });
      }
    }
  }

  function draw() {
    if (root.offsetParent === null) return;
    const { ctx, w, h } = setupCanvas(canvas);
    if (w < 40) return;
    pad = { w, h };
    ctx.fillStyle = '#0a0f14';
    ctx.fillRect(0, 0, w, h);

    ctx.strokeStyle = 'rgba(80,105,125,0.16)';
    ctx.lineWidth = 1;
    for (let x = 0; x < w; x += 32) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, h);
      ctx.stroke();
    }
    for (let y = 0; y < h; y += 32) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(w, y);
      ctx.stroke();
    }

    for (const [id, zone] of Object.entries(ZONES)) {
      const r = zoneRect(zone, w, h);
      ctx.save();
      ctx.setLineDash([5, 4]);
      ctx.strokeStyle = id === 'pause' ? 'rgba(240,180,94,0.7)' : 'rgba(110,231,168,0.7)';
      ctx.strokeRect(r.x, r.y, r.w, r.h);
      ctx.fillStyle = id === 'pause' ? 'rgba(240,180,94,0.07)' : 'rgba(110,231,168,0.07)';
      ctx.fillRect(r.x, r.y, r.w, r.h);
      ctx.restore();
      label(ctx, zone.label, r.x + 6, r.y + 12, id === 'pause' ? 'rgba(240,180,94,0.9)' : 'rgba(110,231,168,0.9)', 'left', 9);
    }

    // Movement trails.
    for (const [id, color] of Object.entries(COLORS)) {
      const finger = engine.get(id);
      if (!finger || finger.history.length < 2) continue;
      const pts = finger.history.filter((e) => Number.isFinite(e.x) && Number.isFinite(e.y)).slice(-40);
      ctx.save();
      ctx.strokeStyle = color;
      ctx.globalAlpha = 0.28;
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      pts.forEach((p, i) => {
        const sx = clamp(p.x, 0, w);
        const sy = clamp(p.y, 0, h);
        if (i === 0) ctx.moveTo(sx, sy);
        else ctx.lineTo(sx, sy);
      });
      ctx.stroke();
      ctx.restore();
    }

    for (const id of ['eye-left', 'eye-right']) {
      const pos = toPx(id);
      const finger = engine.get(id);
      if (!pos) continue;
      const color = COLORS[id];
      if (finger.state === 'paused') {
        ctx.save();
        ctx.setLineDash([3, 3]);
        ctx.strokeStyle = color;
        ctx.beginPath();
        ctx.arc(pos.x, pos.y, 16, 0, Math.PI * 2);
        ctx.stroke();
        ctx.restore();
      }
      marker(ctx, pos.x, pos.y, color, 9, 'circle', finger.contact);
      label(ctx, id === 'eye-left' ? 'L' : 'R', pos.x, pos.y + 0.5, '#0a0f14', 'center', 10);
      label(ctx, `${finger.state} · ${fmt(finger.confidence * 100, 0)}%`, pos.x, pos.y - 20, color, 'center', 9);
    }

    if (lastTouch) {
      const finger = engine.get('touch');
      marker(ctx, lastTouch.x, lastTouch.y, COLORS.touch, 7, 'square', finger.contact);
      label(ctx, `touch · ${finger.state}`, lastTouch.x, lastTouch.y - 18, COLORS.touch, 'center', 9);
    }

    label(ctx, 'pointer drag = eye saccade (markers) or physical touch (anywhere else)', 10, h - 10, 'rgba(130,155,175,0.75)');
  }

  function updatePanels() {
    clear(tableBody);
    for (const s of engine.snapshots()) {
      tableBody.appendChild(
        h(
          'tr',
          {},
          h('td', {}, s.label),
          h('td', {}, badge(s.source, 'muted')),
          h('td', {}, badge(s.state, s.state === 'paused' ? 'warn' : s.state === 'idle' ? 'muted' : 'good')),
          h('td', { class: 'mono' }, s.position ? `${s.position.x}, ${s.position.y}` : '—'),
          h('td', { class: 'mono' }, `${Math.round(s.confidence * 100)}%`),
          h('td', { class: 'mono' }, String(s.historyLength)),
        ),
      );
    }

    clear(historyList);
    const recent = engine.events.slice(-12).reverse();
    if (!recent.length) {
      historyList.appendChild(h('li', { class: 'muted' }, 'No interactions yet.'));
    }
    recent.forEach((e) => {
      const finger = engine.get(e.fingerId);
      historyList.appendChild(
        h(
          'li',
          {},
          h('span', { class: 'mono muted' }, new Date(e.t).toLocaleTimeString([], { hour12: false })),
          h('strong', {}, finger ? finger.label : e.fingerId),
          badge(e.type, e.type === 'suppressed' ? 'bad' : 'accent'),
          h('span', { class: 'mono muted' }, `→ ${e.state} · ${e.source}`),
        ),
      );
    });
  }

  engine.onChange(updatePanels);

  root.appendChild(
    sectionGrid(
      panel(
        'Interaction surface',
        'Two independent eye fingers and physical touch drive the same operations and the same state machine.',
        canvas,
        note,
      ),
      panel(
        'Operations',
        'Applied to the selected finger. Invalid transitions are suppressed and logged.',
        h('div', { class: 'control' }, h('span', {}, 'Finger'), fingerSelect),
        h(
          'div',
          { class: 'btn-row wrap' },
          btn('Contact', () => operation('contact'), { id: 'op-contact' }),
          btn('Move +24 px', () => operation('move'), { id: 'op-move' }),
          btn('Pause', () => operation('pause'), { id: 'op-pause' }),
          btn('Resume', () => operation('resume'), { id: 'op-resume' }),
          btn('Release', () => operation('release'), { id: 'op-release' }),
          btn('Click', () => operation('click'), { id: 'op-click' }),
          btn('Hold', () => operation('hold'), { id: 'op-hold' }),
          btn('Context', () => operation('context'), { id: 'op-context' }),
        ),
        h(
          'div',
          { class: 'btn-row wrap' },
          btn('Look away (release eye)', () => {
            const id = fingerSelect.value;
            const pos = toPx(id) || { x: pad.w / 2, y: pad.h / 2 };
            engine.dispatch(id, 'release', { ...pos, source: id, suppressClick: true });
          }),
          btn('Hand over eye → touch', () => {
            const id = fingerSelect.value === 'touch' ? 'eye-left' : fingerSelect.value;
            const res = engine.handoverInteraction(id, 'touch');
            note.textContent = res.ok
              ? 'Interaction handed over without a duplicate contact; history is preserved.'
              : `Handover unavailable: ${res.reason}`;
          }),
          btn('Reset fingers', () => resetPad()),
        ),
      ),
      panel(
        'Finger state',
        'Identity, position, contact, movement history, gesture state, target, source and confidence.',
        h(
          'table',
          { class: 'data-table' },
          h('thead', {}, h('tr', {}, h('th', {}, 'Finger'), h('th', {}, 'Source'), h('th', {}, 'State'), h('th', {}, 'Position'), h('th', {}, 'Confidence'), h('th', {}, 'Events'))),
          tableBody,
        ),
        h('h3', {}, 'Recent interaction history'),
        historyList,
      ),
    ),
  );

  updatePanels();

  return {
    onShow() {
      draw();
      updatePanels();
    },
    tick() {
      draw();
      checkDwellGestures();
      frame += 1;
      if (frame % 6 === 0) updatePanels();
    },
  };
}
