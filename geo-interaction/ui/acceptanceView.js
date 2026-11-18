// Acceptance demonstrations — each of the ten required demonstrations is
// evaluated from live prototype state, not asserted in prose.

import { fmt } from '../core/util.js';
import { badge, clear, h, panel, sectionGrid } from './dom.js';

export function mountAcceptance(root, app) {
  const { calibration, field, capture, engine, gestures, switch: ctl, log } = app;

  const rows = new Map();
  const list = h('div', { class: 'acceptance-list' });
  const summary = h('p', { class: 'mono' }, '');

  const CHECKS = [
    {
      id: 'calibrated-field',
      title: 'Calibrated geometric field with known physical dimensions',
      evaluate() {
        const pct = calibration.completeness();
        const ok = pct >= 0.999 && calibration.get('screen.widthMm') > 0;
        return {
          pass: ok,
          evidence: `${Math.round(pct * 100)}% of required fields are individual measurements · ${fmt(calibration.get('screen.widthMm'), 0)} × ${fmt(calibration.get('screen.heightMm'), 0)} mm · 1 mm grid`,
        };
      },
    },
    {
      id: 'separate-geometry',
      title: 'Separate captured and simulated reference geometry',
      evaluate() {
        const captured = field.rows.filter((r) => r.observed).length;
        const simulated = field.rows.filter((r) => r.predicted).length;
        return {
          pass: captured > 0 && simulated > 0,
          evidence: `${captured} anchors with captured positions · ${simulated} simulated positions · both layers drawn independently`,
        };
      },
    },
    {
      id: 'out-of-frame',
      title: 'Predicted out-of-frame anchors',
      evaluate() {
        const s = field.summary();
        return {
          pass: s.outOfFrame.length > 0,
          evidence: s.outOfFrame.length
            ? `${s.outOfFrame.length} anchors predicted outside the camera frame: ${s.outOfFrame.slice(0, 3).join(', ')}`
            : 'No anchor currently outside the camera frame',
        };
      },
    },
    {
      id: 'reconciled',
      title: 'Reconciled representation respecting defined tolerances',
      evaluate() {
        const within = field.rows.filter((r) => r.reconciled && Number.isFinite(r.deviation) && r.deviation <= field.view.toleranceMm);
        const s = field.summary();
        return {
          pass: within.length > 0,
          evidence: within.length
            ? `${within.length} anchors reconciled within ${fmt(field.view.toleranceMm, 1)} mm · max deviation ${fmt(s.maxDeviationMm, 2)} mm, preserved`
            : 'No reconciled anchors yet — capture a frame',
        };
      },
    },
    {
      id: 'capture-schedule',
      title: 'The proposed intermittent capture schedule',
      evaluate() {
        const c = capture.counts;
        const ok = c.initial >= 5 && c.transition >= 1 && c.dwell >= 1;
        return {
          pass: ok,
          evidence: `initial ${c.initial} · transition ${c.transition} · dwell burst ${c.dwell} · base interval ${capture.config.baseIntervalMs} ms · one-minute window`,
        };
      },
    },
    {
      id: 'eye-fingers',
      title: 'Two independently identified virtual eye fingers',
      evaluate() {
        const l = engine.get('eye-left');
        const r = engine.get('eye-right');
        const moved = l.position && r.position ? Math.hypot(l.position.x - r.position.x, l.position.y - r.position.y) : 0;
        return {
          pass: l.history.length > 0 && r.history.length > 0 && moved > 20,
          evidence: `left ${l.state} (${l.history.length} events) · right ${r.state} (${r.history.length} events) · separation ${fmt(moved, 0)} px`,
        };
      },
    },
    {
      id: 'pause-resume',
      title: 'A common pause/resume gesture through eye and physical touch',
      evaluate() {
        const pause = engine.events.filter((e) => e.type === 'pause');
        const resume = engine.events.filter((e) => e.type === 'resume');
        const eye = (list) => list.some((e) => String(e.source).startsWith('eye'));
        const touch = (list) => list.some((e) => e.source === 'touch');
        return {
          pass: eye(pause) && touch(pause) && eye(resume) && touch(resume),
          evidence: `pause from ${[...new Set(pause.map((e) => e.source))].join(', ') || 'none'} · resume from ${[...new Set(resume.map((e) => e.source))].join(', ') || 'none'}`,
        };
      },
    },
    {
      id: 'switch-subdivision',
      title: 'A single fixed switch selecting a coordinate through progressive subdivision',
      evaluate() {
        const s = ctl.status();
        const resolved = Boolean(s.coordinate);
        return {
          pass: resolved && s.activations >= s.depth + 1,
          evidence: resolved
            ? `${s.activations} activations · ${s.depth} subdivision levels · ${fmt(s.coordinate.xMm, 1)}, ${fmt(s.coordinate.yMm, 1)} mm`
            : `${s.activations} activations so far · coordinate not resolved`,
        };
      },
    },
    {
      id: 'switch-click',
      title: 'A click at the resulting coordinate',
      evaluate() {
        const entry = [...log.entries].reverse().find((e) => e.category === 'switch' && e.message.startsWith('Click dispatched'));
        return {
          pass: Boolean(entry),
          evidence: entry ? entry.message : 'No switch click dispatched yet',
        };
      },
    },
    {
      id: 'shared-model',
      title: 'A shared interaction model independent of the input device',
      evaluate() {
        const sources = [...new Set(engine.clicks().map((e) => e.source))];
        const kinds = [...new Set(engine.events.map((e) => e.type))];
        return {
          pass: sources.length >= 2,
          evidence: `clicks from ${sources.join(', ') || 'none'} · operations seen: ${kinds.join(', ') || 'none'}`,
        };
      },
    },
  ];

  for (const check of CHECKS) {
    const status = badge('pending', 'muted');
    const evidence = h('p', { class: 'acceptance-evidence mono' }, '');
    const row = h(
      'div',
      { class: 'acceptance-row', id: `accept-${check.id}` },
      h('div', { class: 'acceptance-head' },
        h('span', { class: 'acceptance-index' }, String(rows.size + 1).padStart(2, '0')),
        h('strong', {}, check.title),
        status),
      evidence,
    );
    rows.set(check.id, { row, status, evidence, check });
    list.appendChild(row);
  }

  function update() {
    let passed = 0;
    for (const { status, evidence, row, check } of rows.values()) {
      let result;
      try {
        result = check.evaluate();
      } catch (err) {
        result = { pass: false, evidence: `error: ${err.message}` };
      }
      status.textContent = result.pass ? 'demonstrated' : 'pending';
      status.className = `badge badge-${result.pass ? 'good' : 'muted'}`;
      row.classList.toggle('passed', result.pass);
      evidence.textContent = result.evidence;
      if (result.pass) passed += 1;
    }
    summary.textContent = `${passed} of ${rows.size} acceptance demonstrations currently demonstrated.`;
  }

  root.appendChild(
    sectionGrid(
      panel(
        'Acceptance demonstrations',
        'Each row is evaluated from live state. Nothing here is asserted without evidence.',
        summary,
        list,
      ),
      panel(
        'Prototype boundary',
        'What this browser prototype simulates, and what a native implementation requires.',
        h('h3', {}, 'Simulated in this prototype'),
        h('ul', { class: 'plain-list' },
          h('li', {}, 'Camera observation — pinhole projection with radial lens distortion and measurement noise'),
          h('li', {}, 'Eye input — pointer-driven gaze with blink and dwell events'),
          h('li', {}, 'Physical touchscreen input — pointer events on the interaction surface'),
          h('li', {}, 'Fixed switch — a button or the space bar'),
          h('li', {}, 'Capture scheduling — a virtual clock, including the one-minute transition window')),
        h('h3', {}, 'Requires separate native Android development'),
        h('ul', { class: 'plain-list' },
          h('li', {}, 'Camera and sensor access'),
          h('li', {}, 'Intermittent capture scheduling against real hardware timers'),
          h('li', {}, 'Android AccessibilityService integration'),
          h('li', {}, 'Touch-event injection or supported gesture dispatch'),
          h('li', {}, 'Physical switch integration'),
          h('li', {}, 'System-wide interaction across applications'),
          h('li', {}, 'Device-specific hardware capabilities')),
        h('p', { class: 'note' }, 'No functionality in this prototype has been verified on Android hardware. It is a working model of the mathematics, geometry and interaction architecture.'),
      ),
    ),
  );

  update();

  return {
    onShow: update,
    tick() {
      update();
    },
  };
}
