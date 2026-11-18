// Capture controller view — the 250 ms interval, the five-capture initial
// sequence, transition captures with the one-minute window, and dwell bursts.

import { REGION_DEFS } from '../core/referentialMap.js';
import { fmt, label, line, setupCanvas } from '../core/util.js';
import {
  badge,
  btn,
  clear,
  h,
  panel,
  sectionGrid,
  stat,
} from './dom.js';

const REASON_COLOR = {
  initial: '#f0b45e',
  transition: '#4cc9e0',
  dwell: '#6ee7a8',
  manual: '#a78bfa',
};

export function mountCapture(root, app) {
  const { capture, calibration, log } = app;

  const modeBadge = h('span', {});
  const totalStat = h('div', {});
  const initialStat = h('div', {});
  const transitionStat = h('div', {});
  const dwellStat = h('div', {});
  const observationLine = h('p', { class: 'mono muted' }, '');
  const windowLine = h('p', { class: 'mono' }, '');
  const targetList = h('ol', { class: 'plain-list ordered' });
  const timeline = h('canvas', { class: 'timeline-canvas' });
  const configBox = h('div', { class: 'kv-list' });

  const speed = h('select', { class: 'select' },
    h('option', { value: '1' }, '1× real time'),
    h('option', { value: '4' }, '4×'),
    h('option', { value: '20' }, '20×'));
  speed.addEventListener('change', () => {
    capture.speed = Number(speed.value);
    log.add('capture', `Capture clock speed set to ${speed.value}×`, { speed: capture.speed });
  });

  function candidates() {
    const W = calibration.get('screen.widthMm');
    const H = calibration.get('screen.heightMm');
    return REGION_DEFS.map((r) => {
      const cx = (r.rect.x + r.rect.w / 2 - 0.5) * W;
      const cy = (r.rect.y + r.rect.h / 2 - 0.5) * H;
      return { id: r.id, label: r.label, distanceMm: Math.hypot(cx, cy) };
    }).sort((a, b) => a.distanceMm - b.distanceMm);
  }

  function refreshCandidates() {
    const list = candidates();
    capture.setCandidates(list);
    clear(targetList);
    list.forEach((c, i) => {
      targetList.appendChild(
        h(
          'li',
          {},
          h('span', {}, c.label),
          h('span', { class: 'mono muted' }, `${fmt(c.distanceMm, 0)} mm`),
          i === 0 ? badge('nearest', 'accent') : null,
          h(
            'button',
            {
              class: 'btn btn-ghost btn-small',
              type: 'button',
              onclick: () => capture.requestDwell(c),
            },
            'Dwell here',
          ),
        ),
      );
    });
  }

  function drawTimeline() {
    if (root.offsetParent === null) return;
    const { ctx, w, h: ch } = setupCanvas(timeline);
    if (w < 40) return;
    ctx.fillStyle = '#0a0f14';
    ctx.fillRect(0, 0, w, ch);
    const spanMs = 12000;
    const now = capture.clock;
    const start = Math.max(0, now - spanMs);
    const xOf = (t) => ((t - start) / spanMs) * w;

    // Base interval ruler.
    const base = capture.config.baseIntervalMs;
    ctx.strokeStyle = 'rgba(90,120,145,0.18)';
    ctx.beginPath();
    for (let t = Math.ceil(start / base) * base; t <= now; t += base) {
      const x = xOf(t);
      ctx.moveTo(x, ch - 18);
      ctx.lineTo(x, ch - 8);
    }
    ctx.stroke();
    label(ctx, `base interval ${base} ms (1/240 min)`, 10, ch - 4, 'rgba(140,165,185,0.8)');

    // Captures.
    for (const c of capture.captures) {
      if (c.at < start) continue;
      const x = xOf(c.at);
      const color = REASON_COLOR[c.reason] || '#8fa3b8';
      line(ctx, x, 10, x, ch - 22, color, 2);
      if (c.reason === 'transition') {
        ctx.save();
        ctx.fillStyle = 'rgba(76,201,224,0.9)';
        ctx.beginPath();
        ctx.arc(x, 8, 2.4, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      }
      if (c.reason === 'dwell') {
        ctx.save();
        ctx.fillStyle = 'rgba(110,231,168,0.9)';
        ctx.beginPath();
        ctx.arc(x, ch - 26, 2.4, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      }
    }
    label(ctx, 'captures (last 12 s)', w - 10, 12, 'rgba(140,165,185,0.8)', 'right');
  }

  function update() {
    const s = capture.status();
    modeBadge.textContent = s.mode;
    modeBadge.className = `badge badge-${s.mode === 'idle' ? 'muted' : s.mode === 'dwell' ? 'good' : 'accent'}`;
    totalStat.textContent = String(s.total);
    initialStat.textContent = String(s.counts.initial || 0);
    transitionStat.textContent = String(s.counts.transition || 0);
    dwellStat.textContent = String(s.counts.dwell || 0);

    observationLine.textContent = s.observationAgeMs == null
      ? 'No observation captured yet — the model is prediction only.'
      : `Last observation ${Math.round(s.observationAgeMs)} ms ago · ${s.lastCaptureReason} · controller ${s.running ? 'running' : 'stopped'}`;

    windowLine.textContent = s.windowRemainingMs == null
      ? 'Transition window: not started'
      : `Transition window restarts at each transition capture · ${fmt(s.windowRemainingMs / 1000, 1)} s remaining`;

    clear(configBox);
    const c = capture.config;
    [
      ['Base capture interval', `${c.baseIntervalMs} ms = 1/240 min`],
      ['Initial motion sequence', `${c.initialCount} captures at ${c.initialSpacingMs} ms spacing`],
      ['Transition window', `${c.transitionWindowMs / 1000} s, restarted per transition capture`],
      ['Dwell burst', `${c.dwellBurstCount} captures at ${c.dwellBurstIntervalMs} ms`],
      ['Saccade model', `${c.saccadeSpeedMmPerSec} mm/s, nearest target first`],
    ].forEach(([k, v]) => configBox.appendChild(h('div', { class: 'kv' }, h('span', { class: 'kv-label' }, k), h('span', { class: 'kv-value' }, v))));

    drawTimeline();
  }

  root.appendChild(
    sectionGrid(
      panel(
        'Capture schedule',
        'The camera is not assumed to run continuously. Scheduling, prediction and measurement stay separate.',
        h('div', { class: 'chips' }, h('span', { class: 'muted' }, 'mode'), modeBadge),
        h('div', { class: 'stat-row' },
          stat('Captures', totalStat),
          stat('Initial', initialStat),
          stat('Transition', transitionStat),
          stat('Dwell burst', dwellStat)),
        observationLine,
        windowLine,
        h('div', { class: 'btn-row' },
          btn('Start controller', () => capture.start(), { variant: 'primary', id: 'capture-start' }),
          btn('Stop', () => capture.stop(), { id: 'capture-stop' }),
          btn('Initial motion (5 captures)', () => capture.beginInitialMotion(), { id: 'initial-motion' }),
          btn('Transition schedule', () => capture.requestTransition(), { id: 'transition-schedule' }),
          btn('Dwell burst (nearest)', () => capture.requestDwell(capture.candidates[0]), { id: 'dwell-burst' })),
        h('div', { class: 'control' }, h('span', {}, 'Clock speed'), speed),
      ),
      panel(
        'Capture timeline',
        'Each line is one requested observation. Transition captures restart the one-minute window.',
        timeline,
        h('div', { class: 'legend-row' },
          h('span', { class: 'legend-item' }, h('span', { class: 'legend-dot', style: { background: REASON_COLOR.initial } }), 'initial'),
          h('span', { class: 'legend-item' }, h('span', { class: 'legend-dot', style: { background: REASON_COLOR.transition } }), 'transition'),
          h('span', { class: 'legend-item' }, h('span', { class: 'legend-dot', style: { background: REASON_COLOR.dwell } }), 'dwell burst')),
        h('p', { class: 'note' }, 'The five-capture spacing and the exact one-minute reset interpretation are configurable pending validation.'),
      ),
      panel(
        'Possible next dwell targets',
        'Ordered from the nearest to the most distant. The system does not assume it knows the order of the next dwell.',
        targetList,
        btn('Refresh candidates', refreshCandidates),
      ),
      panel('Schedule configuration', 'Values in force for this prototype run.', configBox),
    ),
  );

  refreshCandidates();
  update();

  return {
    onShow() {
      refreshCandidates();
      update();
    },
    tick() {
      update();
    },
  };
}
