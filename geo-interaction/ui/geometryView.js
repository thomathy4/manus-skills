// Geometry laboratory — the square-millimetre grid, captured / simulated /
// reconciled reference lines, predicted out-of-frame anchors and tolerances.

import {
  clamp,
  fmt,
  label,
  line,
  marker,
  setupCanvas,
} from '../core/util.js';
import {
  badge,
  btn,
  clear,
  h,
  legendItem,
  panel,
  sectionGrid,
  stat,
} from './dom.js';

const COLOR = {
  observed: '#f0b45e',
  predicted: '#4cc9e0',
  derived: '#a78bfa',
  uncertain: '#f87171',
  reconciled: '#6ee7a8',
  screen: '#8fa3b8',
  grid: '#22303c',
  camera: '#4cc9e0',
};

const STATUS_TONE = {
  observed: 'good',
  predicted: 'accent',
  derived: 'derived',
  uncertain: 'bad',
};

export function mountGeometry(root, app) {
  const { field, calibration, log } = app;

  const canvas = h('canvas', { class: 'field-canvas', id: 'geometry-canvas' });
  const chips = h('div', { class: 'chips' });
  const tableBody = h('tbody');
  const outOfFrameList = h('ul', { class: 'plain-list' });
  const toleranceOut = h('span', { class: 'out' });
  const yawOut = h('span', { class: 'out' });
  const pitchOut = h('span', { class: 'out' });
  const distOut = h('span', { class: 'out' });

  const toggles = {
    grid: true,
    captured: true,
    simulated: true,
    combined: true,
    anchors: true,
    cameraFrame: true,
  };

  const toggleDefs = [
    ['grid', '1 mm grid', '#22303c'],
    ['captured', 'Captured lines', COLOR.observed],
    ['simulated', 'Simulated lines', COLOR.predicted],
    ['combined', 'Combined / reconciled', COLOR.reconciled],
    ['anchors', 'Anchors', COLOR.derived],
    ['cameraFrame', 'Camera frame', COLOR.camera],
  ];

  const toggleRow = h('div', { class: 'toggle-row' });
  toggleDefs.forEach(([key, text, color]) => {
    const input = h('input', { type: 'checkbox', checked: toggles[key] });
    input.addEventListener('change', () => {
      toggles[key] = input.checked;
    });
    toggleRow.appendChild(
      h('label', { class: 'toggle' }, input, h('span', { class: 'legend-dot', style: { background: color } }), text),
    );
  });

  const yaw = h('input', { type: 'range', min: -45, max: 45, step: 1, value: field.view.yawDeg, class: 'range' });
  yaw.addEventListener('input', () => {
    yawOut.textContent = `${yaw.value}°`;
    field.setView({ yawDeg: Number(yaw.value) });
  });
  yaw.addEventListener('change', () => {
    log.add('geometry', `Simulated camera yaw set to ${yaw.value}°`, { yawDeg: Number(yaw.value) });
  });
  yawOut.textContent = `${field.view.yawDeg}°`;

  const pitch = h('input', { type: 'range', min: -40, max: 40, step: 1, value: field.view.pitchDeg, class: 'range' });
  pitch.addEventListener('input', () => {
    pitchOut.textContent = `${pitch.value}°`;
    field.setView({ pitchDeg: Number(pitch.value) });
  });
  pitchOut.textContent = `${field.view.pitchDeg}°`;

  const dist = h('input', {
    type: 'range',
    min: 250,
    max: 950,
    step: 5,
    value: field.eyeDistanceMm,
    class: 'range',
  });
  dist.addEventListener('input', () => {
    distOut.textContent = `${dist.value} mm`;
    field.setView({ eyeDistanceMm: Number(dist.value) });
  });
  distOut.textContent = `${Math.round(field.eyeDistanceMm)} mm`;

  const tolerance = h('input', {
    type: 'number',
    class: 'num',
    min: 0.5,
    max: 20,
    step: 0.5,
    value: field.view.toleranceMm,
  });
  tolerance.addEventListener('input', () => {
    field.setView({ toleranceMm: clamp(Number(tolerance.value), 0.5, 20) });
    toleranceOut.textContent = `${field.view.toleranceMm} mm`;
  });
  toleranceOut.textContent = `${field.view.toleranceMm} mm`;

  const correction = h('input', { type: 'checkbox', checked: field.view.distortionCorrection });
  correction.addEventListener('change', () => {
    field.setView({ distortionCorrection: correction.checked });
    log.add('geometry', `Lens deformation compensation ${correction.checked ? 'enabled' : 'disabled'}`, {
      distortionCorrection: correction.checked,
    });
  });

  let liveTimer = null;
  const liveInput = h('input', { type: 'checkbox' });
  liveInput.addEventListener('change', () => {
    if (liveInput.checked) {
      liveTimer = setInterval(() => field.capture('manual'), 250);
      log.add('geometry', 'Continuous observation enabled (debug) — 250 ms capture interval');
    } else if (liveTimer) {
      clearInterval(liveTimer);
      liveTimer = null;
      log.add('geometry', 'Continuous observation disabled');
    }
  });

  function draw() {
    if (!root.isConnected || root.offsetParent === null) return;
    const { ctx, w, h: canvasH } = setupCanvas(canvas);
    if (w < 40) return;

    const screenW = calibration.get('screen.widthMm');
    const screenH = calibration.get('screen.heightMm');
    const ext = field.fieldExtent();
    const scale = Math.min(w / (ext.halfW * 2), canvasH / (ext.halfH * 2));
    const cx = w / 2;
    const cy = canvasH / 2;
    const toPx = (p) => ({ x: cx + p.xMm * scale, y: cy + p.yMm * scale });
    const visibleHalfW = w / 2 / scale;
    const visibleHalfH = canvasH / 2 / scale;

    ctx.fillStyle = '#0a0f14';
    ctx.fillRect(0, 0, w, canvasH);

    if (toggles.grid) {
      const step = scale >= 1.05 ? 1 : 5;
      ctx.lineWidth = 1;
      for (let x = -Math.ceil(visibleHalfW / step) * step; x <= visibleHalfW; x += step) {
        const px = cx + x * scale;
        const major = Math.abs(x % 10) < 1e-6;
        const mid = Math.abs(x % 50) < 1e-6;
        ctx.strokeStyle = mid ? 'rgba(120,150,175,0.22)' : major ? 'rgba(100,130,155,0.12)' : 'rgba(90,120,145,0.05)';
        ctx.beginPath();
        ctx.moveTo(px, 0);
        ctx.lineTo(px, canvasH);
        ctx.stroke();
      }
      for (let y = -Math.ceil(visibleHalfH / step) * step; y <= visibleHalfH; y += step) {
        const py = cy + y * scale;
        const major = Math.abs(y % 10) < 1e-6;
        const mid = Math.abs(y % 50) < 1e-6;
        ctx.strokeStyle = mid ? 'rgba(120,150,175,0.22)' : major ? 'rgba(100,130,155,0.12)' : 'rgba(90,120,145,0.05)';
        ctx.beginPath();
        ctx.moveTo(0, py);
        ctx.lineTo(w, py);
        ctx.stroke();
      }
      label(ctx, `1 mm grid · ${fmt(scale, 2)} px/mm`, 10, 14, 'rgba(150,175,195,0.75)');
    }

    // Physical screen boundary.
    const screenRect = field.screenRect();
    const tl = toPx({ xMm: screenRect.x, yMm: screenRect.y });
    ctx.fillStyle = 'rgba(28,42,54,0.35)';
    ctx.fillRect(tl.x, tl.y, screenRect.w * scale, screenRect.h * scale);
    ctx.strokeStyle = COLOR.screen;
    ctx.lineWidth = 1.5;
    ctx.strokeRect(tl.x, tl.y, screenRect.w * scale, screenRect.h * scale);
    label(ctx, `${fmt(screenW, 0)} × ${fmt(screenH, 0)} mm`, tl.x + 6, tl.y - 8, 'rgba(160,185,205,0.9)');

    if (toggles.cameraFrame) {
      const camRect = field.cameraFrame();
      const c1 = toPx({ xMm: camRect.x, yMm: camRect.y });
      ctx.save();
      ctx.setLineDash([5, 4]);
      ctx.strokeStyle = 'rgba(76,201,224,0.55)';
      ctx.lineWidth = 1;
      ctx.strokeRect(c1.x, c1.y, camRect.w * scale, camRect.h * scale);
      ctx.restore();
      label(ctx, 'camera frame', c1.x + 4, c1.y + 10, 'rgba(76,201,224,0.8)');
    }

    const rows = field.rows;
    const byId = Object.fromEntries(rows.map((r) => [r.anchor.id, r]));
    const drawPoint = (row, p) => {
      if (!p) return null;
      const px = toPx(p);
      const clampedX = clamp(px.x, 6, w - 6);
      const clampedY = clamp(px.y, 6, canvasH - 6);
      const out = clampedX !== px.x || clampedY !== px.y;
      return { x: clampedX, y: clampedY, out };
    };

    const irisL = byId.irisLeft;
    const irisR = byId.irisRight;
    const nose = byId.noseBridge;
    const chin = byId.chinCenter;

    if (toggles.simulated) {
      if (irisL?.predicted && irisR?.predicted) {
        const a = drawPoint(irisL, irisL.predicted);
        const b = drawPoint(irisR, irisR.predicted);
        line(ctx, a.x, a.y, b.x, b.y, 'rgba(76,201,224,0.85)', 1.4, [6, 4]);
      }
      if (nose?.predicted && chin?.predicted) {
        const a = drawPoint(nose, nose.predicted);
        const b = drawPoint(chin, chin.predicted);
        line(ctx, a.x, a.y, b.x, b.y, 'rgba(76,201,224,0.45)', 1, [3, 5]);
      }
    }

    if (toggles.captured) {
      if (irisL?.observed && irisR?.observed) {
        const a = drawPoint(irisL, irisL.observed);
        const b = drawPoint(irisR, irisR.observed);
        line(ctx, a.x, a.y, b.x, b.y, 'rgba(240,180,94,0.95)', 1.6);
      }
    }

    if (toggles.combined) {
      if (irisL?.reconciled && irisR?.reconciled) {
        const a = drawPoint(irisL, irisL.reconciled);
        const b = drawPoint(irisR, irisR.reconciled);
        line(ctx, a.x, a.y, b.x, b.y, 'rgba(110,231,168,0.9)', 2);
      }
    }

    if (toggles.anchors) {
      for (const row of rows) {
        const p = row.predicted;
        if (!p) continue;
        const pos = drawPoint(row, p);
        if (!pos) continue;
        const isKey = ['irisLeft', 'irisRight', 'noseBridge', 'chinCenter'].includes(row.anchor.id);
        if (row.anchor.layer === 'derived') {
          marker(ctx, pos.x, pos.y, COLOR.derived, 3, 'diamond');
        } else if (row.status === 'observed') {
          marker(ctx, pos.x, pos.y, COLOR.observed, 3.4, 'circle', true);
        } else if (row.status === 'uncertain') {
          marker(ctx, pos.x, pos.y, COLOR.uncertain, 4, 'triangle');
        } else {
          marker(ctx, pos.x, pos.y, COLOR.predicted, 3.2, 'circle');
        }
        if (row.observed && toggles.captured) {
          const op = drawPoint(row, row.observed);
          if (op && !op.out) marker(ctx, op.x, op.y, COLOR.observed, 2.2, 'circle', true);
        }
        if (pos.out) {
          marker(ctx, pos.x, pos.y, COLOR.predicted, 4.5, 'triangle');
          label(ctx, `${row.anchor.label} (predicted, out of frame)`, clamp(pos.x + 8, 8, w - 8), pos.y, 'rgba(76,201,224,0.9)', pos.x > w - 160 ? 'right' : 'left', 9);
        } else if (isKey) {
          label(ctx, row.anchor.label, pos.x + 7, pos.y - 7, 'rgba(200,215,230,0.85)', 'left', 9);
        }
      }
    }

    // Field extent annotation.
    label(ctx, `field extent ±${fmt(ext.halfW, 0)} × ±${fmt(ext.halfH, 0)} mm`, 10, canvasH - 12, 'rgba(130,155,175,0.7)');
    label(ctx, `origin: screen centre · +x right · +y down`, w - 10, canvasH - 12, 'rgba(130,155,175,0.7)', 'right');
  }

  function updatePanels() {
    const s = field.summary();
    clear(chips);
    chips.appendChild(badge(`${s.counts.observed} observed`, 'good'));
    chips.appendChild(badge(`${s.counts.predicted} predicted`, 'accent'));
    chips.appendChild(badge(`${s.counts.derived} derived`, 'derived'));
    chips.appendChild(badge(`${s.counts.uncertain} uncertain`, 'bad'));
    chips.appendChild(badge(`tolerance ${fmt(s.toleranceMm, 1)} mm`, 'muted'));

    clear(tableBody);
    for (const row of field.rows) {
      tableBody.appendChild(
        h(
          'tr',
          {},
          h('td', {}, row.anchor.label),
          h('td', {}, badge(row.status, STATUS_TONE[row.status] || 'muted')),
          h('td', { class: 'mono' }, row.predicted ? `${fmt(row.predicted.xMm, 1)}, ${fmt(row.predicted.yMm, 1)}` : '—'),
          h('td', { class: 'mono' }, row.observed ? `${fmt(row.observed.xMm, 1)}, ${fmt(row.observed.yMm, 1)}` : '—'),
          h('td', { class: 'mono' }, field.describeDeviation(row)),
          h('td', { class: 'mono' }, row.inCameraFrame ? 'in frame' : 'out of frame'),
        ),
      );
    }

    clear(outOfFrameList);
    const out = field.summary().outOfFrameRows;
    if (!out.length) {
      outOfFrameList.appendChild(h('li', { class: 'muted' }, 'No predicted anchors outside the camera frame at this geometry.'));
    } else {
      out.forEach((r) => {
        outOfFrameList.appendChild(
          h(
            'li',
            {},
            h('strong', {}, r.anchor.label),
            ` — predicted ${r.predicted ? `${fmt(r.predicted.xMm, 1)}, ${fmt(r.predicted.yMm, 1)} mm` : '—'} · `,
            h('span', { class: 'muted' }, 'position retained from the calibrated model'),
          ),
        );
      });
    }
  }

  field.onChange(updatePanels);

  root.appendChild(
    sectionGrid(
      panel(
        'Calibrated geometric field',
        'Only the grid, captured reference lines, simulated reference lines and the reconciled combination are drawn.',
        canvas,
        toggleRow,
        h('div', { class: 'legend-row' },
          legendItem(COLOR.observed, 'captured'),
          legendItem(COLOR.predicted, 'simulated'),
          legendItem(COLOR.reconciled, 'combined'),
          legendItem(COLOR.derived, 'derived anchor'),
          legendItem(COLOR.uncertain, 'beyond tolerance')),
        chips,
      ),
      panel(
        'Simulation controls',
        'The model is retained; these controls move the viewing geometry, they do not rebuild the model.',
        h('div', { class: 'control' }, h('span', {}, 'Camera yaw'), yaw, yawOut),
        h('div', { class: 'control' }, h('span', {}, 'Camera pitch'), pitch, pitchOut),
        h('div', { class: 'control' }, h('span', {}, 'Eye-to-screen distance'), dist, distOut),
        h('div', { class: 'control' }, h('span', {}, 'Reconciliation tolerance'), tolerance, toleranceOut),
        h('label', { class: 'toggle' }, correction, 'Compensate lens deformation (k₁)'),
        h('div', { class: 'btn-row' },
          btn('Capture frame', () => field.capture('manual'), { variant: 'primary', id: 'capture-frame' }),
          h('label', { class: 'toggle' }, liveInput, 'Continuous observation (250 ms, debug)')),
        h('p', { class: 'note' }, 'Turn off deformation compensation to see measured positions drift from the simulation — the deviation is preserved, never hidden.'),
      ),
      panel(
        'Predicted anchors outside the frame',
        'An anchor leaving the image does not invalidate its known geometric position.',
        outOfFrameList,
      ),
      panel(
        'Anchor state',
        'Measured, predicted, derived and reconciled values are kept separate.',
        h(
          'table',
          { class: 'data-table' },
          h('thead', {}, h('tr', {}, h('th', {}, 'Anchor'), h('th', {}, 'Status'), h('th', {}, 'Predicted mm'), h('th', {}, 'Observed mm'), h('th', {}, 'Deviation'), h('th', {}, 'Camera'))),
          tableBody,
        ),
      ),
    ),
  );

  updatePanels();

  return {
    onShow() {
      updatePanels();
      draw();
    },
    tick() {
      draw();
    },
  };
}
