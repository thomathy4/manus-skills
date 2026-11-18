// Application shell: wires the subsystems together and owns the single frame
// loop. Layers are created once; the capture controller, geometry field,
// gesture recogniser and virtual-finger engine are independent modules.

import { EventLog } from './core/events.js';
import { Calibration } from './core/calibration.js';
import { GeometryField } from './core/field.js';
import { CaptureController } from './core/capture.js';
import { FingerEngine } from './core/finger.js';
import { GestureRecognizer } from './core/gestures.js';
import { ReferentialMap } from './core/referentialMap.js';
import { SwitchController } from './core/switch.js';

import { mountCalibration } from './ui/calibrationView.js';
import { mountGeometry } from './ui/geometryView.js';
import { mountCapture } from './ui/captureView.js';
import { mountFinger } from './ui/fingerView.js';
import { mountSwitch } from './ui/switchView.js';
import { mountGesture } from './ui/gestureView.js';
import { mountAcceptance } from './ui/acceptanceView.js';
import { mountLog } from './ui/logView.js';
import { h } from './ui/dom.js';

const log = new EventLog(900);
const calibration = new Calibration(log);
const field = new GeometryField(calibration, log);
const capture = new CaptureController(log, field);
const engine = new FingerEngine(log);
const map = new ReferentialMap(log);
const switchController = new SwitchController({ log, map, calibration, onActivate: null });
const gestures = new GestureRecognizer({ log, engine, fingerId: 'eye-left' });

engine.register({ id: 'eye-left', label: 'Eye finger — left', source: 'eye-left' });
engine.register({ id: 'eye-right', label: 'Eye finger — right', source: 'eye-right' });
engine.register({ id: 'touch', label: 'Physical touch', source: 'touch' });
engine.register({ id: 'switch', label: 'Fixed switch', source: 'switch' });

const app = {
  log,
  calibration,
  field,
  capture,
  engine,
  map,
  switch: switchController,
  gestures,
  state: { activeSection: null },
};
window.__geo = app;

const SECTIONS = [
  { id: 'calibration', label: 'Calibration', mount: mountCalibration },
  { id: 'geometry', label: 'Geometry laboratory', mount: mountGeometry },
  { id: 'capture', label: 'Capture controller', mount: mountCapture },
  { id: 'fingers', label: 'Virtual finger laboratory', mount: mountFinger },
  { id: 'switch', label: 'Universal switch laboratory', mount: mountSwitch },
  { id: 'gestures', label: 'Gesture laboratory', mount: mountGesture },
  { id: 'acceptance', label: 'Acceptance demonstrations', mount: mountAcceptance },
  { id: 'log', label: 'Event history', mount: mountLog },
];

const nav = document.getElementById('nav');
const views = document.getElementById('views');
const chips = document.getElementById('status-chips');
const mounted = new Map();
const navButtons = new Map();

for (const section of SECTIONS) {
  const button = h(
    'button',
    {
      class: 'rail-btn',
      type: 'button',
      id: `nav-${section.id}`,
      onclick: () => activate(section.id),
    },
    section.label,
  );
  navButtons.set(section.id, button);
  nav.appendChild(button);
}

function activate(id) {
  const section = SECTIONS.find((s) => s.id === id);
  if (!section) return;
  for (const [otherId, view] of mounted) {
    if (otherId !== id) view.el.hidden = true;
  }
  let entry = mounted.get(id);
  if (!entry) {
    const el = h('section', { class: 'view', 'data-view': id });
    views.appendChild(el);
    const view = section.mount(el, app) || {};
    entry = { el, view };
    mounted.set(id, entry);
  }
  entry.el.hidden = false;
  navButtons.forEach((button, key) => button.classList.toggle('active', key === id));
  app.state.activeSection = id;
  entry.view.onShow?.();
  if (location.hash !== `#${id}`) history.replaceState(null, '', `#${id}`);
}

const chipEls = {
  calibration: h('span', { class: 'chip' }, ''),
  capture: h('span', { class: 'chip' }, ''),
  fingers: h('span', { class: 'chip' }, ''),
  prototype: h('span', { class: 'chip chip-strong' }, 'browser prototype · not Android-verified'),
};
Object.values(chipEls).forEach((el) => chips.appendChild(el));

let chipFrame = 0;
function updateChips() {
  const pct = Math.round(calibration.completeness() * 100);
  chipEls.calibration.textContent = `calibration ${pct}%`;
  chipEls.calibration.className = `chip ${pct >= 100 ? 'chip-good' : 'chip-warn'}`;
  const mode = capture.status().mode;
  chipEls.capture.textContent = `capture ${mode}`;
  const clicks = engine.clicks().length;
  chipEls.fingers.textContent = `${clicks} click${clicks === 1 ? '' : 's'} · ${engine.events.length} finger events`;
}

function loop(now) {
  capture.tick(now);
  const entry = mounted.get(app.state.activeSection);
  entry?.view.tick?.(now);
  chipFrame += 1;
  if (chipFrame % 8 === 0) updateChips();
  requestAnimationFrame(loop);
}

// A first observation set makes the field legible at startup; everything after
// this is driven by the capture controller or the laboratory controls.
field.capture('manual');
log.add('system', 'Universal Geometric Interaction System prototype started', {
  gridUnitMm: 1,
  baseIntervalMs: capture.config.baseIntervalMs,
});

const initial = location.hash.replace('#', '');
activate(SECTIONS.some((s) => s.id === initial) ? initial : 'calibration');
updateChips();
requestAnimationFrame(loop);
