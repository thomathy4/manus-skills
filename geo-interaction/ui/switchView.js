// Universal switch laboratory — one fixed switch, progressive subdivision, a
// final click at the resolved coordinate, guided by the referential map.

import { fmt, label, line, marker, setupCanvas } from '../core/util.js';
import {
  badge,
  btn,
  clear,
  h,
  panel,
  sectionGrid,
} from './dom.js';

const LAYER_COLOR = {
  regions: 'rgba(76,201,224,0.55)',
  interactive: 'rgba(240,180,94,0.85)',
  navigation: 'rgba(167,139,250,0.7)',
  textMedia: 'rgba(138,210,168,0.6)',
  scrollable: 'rgba(231,143,179,0.7)',
  empty: 'rgba(107,124,143,0.6)',
};

export function mountSwitch(root, app) {
  const { switch: ctl, map, engine, log, calibration } = app;

  const resultLine = h('p', { class: 'mono', id: 'switch-result' }, 'No activation yet.');
  const readout = h('div', { class: 'kv-list' });
  const pathList = h('ol', { class: 'plain-list ordered' });
  const mapSummary = h('div', { class: 'kv-list' });
  const overlay = h('canvas', { class: 'surface-overlay' });

  let ripple = null;
  let lastScan = 0;

  function demoAction(name) {
    resultLine.textContent = `Element reacted: ${name}`;
    log.add('switch', `Element reacted to the switch click: ${name}`, { element: name });
  }

  const surface = h(
    'div',
    { class: 'demo-surface', id: 'switch-surface' },
    h(
      'div',
      { class: 'demo-nav', 'data-nav': true },
      h('span', { class: 'demo-logo', 'data-text': true }, 'FIELD'),
      h(
        'button',
        { class: 'demo-navbtn', 'data-interactive': true, id: 'demo-nav-library', type: 'button', onclick: () => demoAction('Library') },
        'Library',
      ),
      h(
        'button',
        { class: 'demo-navbtn', 'data-interactive': true, id: 'demo-nav-settings', type: 'button', onclick: () => demoAction('Settings') },
        'Settings',
      ),
    ),
    h(
      'div',
      { class: 'demo-main' },
      h(
        'div',
        { class: 'demo-copy-col' },
        h('h3', { 'data-text': true }, 'Sample interface'),
        h('p', { 'data-text': true }, 'Ordinary content, reached with one fixed switch.'),
        h(
          'button',
          { class: 'demo-primary', 'data-interactive': true, id: 'demo-primary', type: 'button', onclick: () => demoAction('Primary action') },
          'Primary action',
        ),
        h(
          'button',
          { class: 'demo-secondary', 'data-interactive': true, id: 'demo-secondary', type: 'button', onclick: () => demoAction('Secondary') },
          'Secondary',
        ),
        h('input', { class: 'demo-input', 'data-interactive': true, id: 'demo-field', placeholder: 'Text field' }),
      ),
      h(
        'div',
        { class: 'demo-list', 'data-scroll': true, 'data-interactive': true, id: 'demo-list' },
        ...Array.from({ length: 9 }, (_, i) => h('div', { class: 'demo-list-row' }, `Row ${i + 1} — scrollable region`)),
      ),
      h('div', { class: 'demo-empty', 'data-empty': true, id: 'demo-empty' }, 'Unrestricted area'),
    ),
  );

  const wrap = h('div', { class: 'surface-wrap' }, surface, overlay);

  const modeSelect = h(
    'select',
    { class: 'select' },
    h('option', { value: 'step' }, 'Step mode (advance, then select)'),
    h('option', { value: 'auto' }, 'Auto-scan (activation selects)'),
  );
  modeSelect.addEventListener('change', () => {
    ctl.config.mode = modeSelect.value;
    log.add('switch', `Switch mode set to ${modeSelect.value}`, { mode: modeSelect.value });
  });

  const depthSelect = h(
    'select',
    { class: 'select' },
    ...[1, 2, 3, 4, 5].map((d) => h('option', { value: String(d), selected: d === ctl.config.depth }, `${d} levels — ${4 ** d} regions`)),
  );
  depthSelect.addEventListener('change', () => {
    ctl.config.depth = Number(depthSelect.value);
    ctl.reset();
    log.add('switch', `Subdivision depth set to ${ctl.config.depth} levels`, { depth: ctl.config.depth });
  });

  const scanMs = h('input', { type: 'number', class: 'num', min: 200, max: 4000, step: 100, value: ctl.config.scanMs });
  scanMs.addEventListener('input', () => {
    ctl.config.scanMs = Number(scanMs.value);
  });

  const boundary = h('input', { type: 'checkbox', checked: ctl.config.boundaryGuided });
  boundary.addEventListener('change', () => {
    ctl.config.boundaryGuided = boundary.checked;
    ctl.reset();
  });

  const layerToggles = {};
  const layerRow = h('div', { class: 'toggle-row' });
  for (const [id, text] of [
    ['regions', 'Interface regions'],
    ['interactive', 'Interactive elements'],
    ['navigation', 'Navigation'],
    ['scrollable', 'Scrollable'],
    ['textMedia', 'Text areas'],
    ['empty', 'Unrestricted'],
    ['candidates', 'Candidate targets'],
    ['subdivisions', 'Subdivision'],
  ]) {
    const input = h('input', { type: 'checkbox', checked: ['regions', 'interactive', 'subdivisions'].includes(id) });
    layerToggles[id] = input;
    layerRow.appendChild(
      h('label', { class: 'toggle' }, input, h('span', { class: 'legend-dot', style: { background: LAYER_COLOR[id] || 'rgba(140,165,185,0.7)' } }), text),
    );
  }

  function activateElement(el) {
    if (!el) return 'nothing under the coordinate';
    const tag = el.tagName.toLowerCase();
    const id = el.id ? `#${el.id}` : '';
    const name = `${tag}${id}`;
    if (tag === 'button' || tag === 'a') el.click();
    else if (tag === 'input') el.focus();
    else if (el.hasAttribute('data-scroll')) el.scrollBy({ top: 120, behavior: 'smooth' });
    return name;
  }

  function onActivate(coord) {
    const rect = surface.getBoundingClientRect();
    const visible = rect.width > 2 && root.offsetParent !== null;
    if (!visible) {
      resultLine.textContent = `Coordinate resolved at ${fmt(coord.xMm, 1)}, ${fmt(coord.yMm, 1)} mm — surface not visible, no element activated.`;
      log.add('switch', 'Coordinate resolved while the surface was hidden — no element was activated', {
        xMm: Math.round(coord.xMm * 10) / 10,
        yMm: Math.round(coord.yMm * 10) / 10,
      });
      return;
    }
    let px = rect.left + coord.xSurface;
    let py = rect.top + coord.ySurface;
    if (px < 0 || py < 0 || px > window.innerWidth || py > window.innerHeight) {
      surface.scrollIntoView({ block: 'center' });
      const scrolled = surface.getBoundingClientRect();
      px = scrolled.left + coord.xSurface;
      py = scrolled.top + coord.ySurface;
    }
    const el = document.elementFromPoint(px, py);
    const inside = el && surface.contains(el) ? el : null;
    engine.dispatch('switch', 'contact', {
      x: coord.xSurface,
      y: coord.ySurface,
      source: 'switch',
      confidence: 0.9,
      provenance: ['fixed-switch', 'progressive-subdivision'],
    });
    engine.dispatch('switch', 'release', {
      x: coord.xSurface,
      y: coord.ySurface,
      source: 'switch',
    });
    const target = inside ? activateElement(inside) : 'no element inside the surface';
    ripple = { x: coord.xSurface, y: coord.ySurface, at: performance.now() };
    resultLine.textContent = `Clicked ${target} at ${fmt(coord.xMm, 1)}, ${fmt(coord.yMm, 1)} mm · ${fmt(coord.xPx, 0)}, ${fmt(coord.yPx, 0)} px`;
    log.add('switch', `Click dispatched at the resolved coordinate → ${target}`, {
      xMm: Math.round(coord.xMm * 10) / 10,
      yMm: Math.round(coord.yMm * 10) / 10,
      target,
      activations: ctl.activations,
    });
    updatePanels();
  }

  ctl.onActivate = onActivate;

  function refreshMap() {
    map.attach(surface);
    const size = map.size;
    if (size.w > 2) ctl.setSurface({ x: 0, y: 0, w: size.w, h: size.h });
    updatePanels();
  }

  function drawOverlay() {
    if (root.offsetParent === null) return;
    const { ctx, w, h } = setupCanvas(overlay);
    if (w < 10) return;
    const layers = map.layers();
    for (const [id, color] of Object.entries(LAYER_COLOR)) {
      if (!layerToggles[id]?.checked) continue;
      const entries = layers[id] || [];
      ctx.save();
      ctx.strokeStyle = color;
      ctx.lineWidth = 1;
      for (const entry of entries) {
        ctx.strokeRect(entry.rect.x + 0.5, entry.rect.y + 0.5, entry.rect.w - 1, entry.rect.h - 1);
      }
      ctx.restore();
    }

    if (layerToggles.candidates?.checked) {
      for (const c of map.candidateTargets()) {
        marker(ctx, c.x, c.y, 'rgba(240,180,94,0.85)', 2.6, 'circle', true);
      }
    }

    const s = ctl.status();
    if (layerToggles.subdivisions?.checked && s.active) {
      for (const p of s.path) {
        ctx.save();
        ctx.setLineDash([4, 4]);
        ctx.strokeStyle = 'rgba(248,113,113,0.4)';
        ctx.strokeRect(p.rect.x, p.rect.y, p.rect.w, p.rect.h);
        ctx.restore();
      }
      s.cells.forEach((cell, i) => {
        const highlighted = i === s.index;
        ctx.save();
        ctx.strokeStyle = highlighted ? '#f0b45e' : 'rgba(248,113,113,0.5)';
        ctx.lineWidth = highlighted ? 2 : 1;
        if (highlighted) {
          ctx.fillStyle = 'rgba(240,180,94,0.16)';
          ctx.fillRect(cell.x, cell.y, cell.w, cell.h);
        }
        ctx.strokeRect(cell.x + 0.5, cell.y + 0.5, cell.w - 1, cell.h - 1);
        ctx.restore();
        if (cell.w > 46 && cell.h > 24) {
          label(ctx, cell.quadrant, cell.x + 5, cell.y + 11, highlighted ? '#f0b45e' : 'rgba(248,113,113,0.8)', 'left', 9);
        }
      });
    }

    if (s.coordinate) {
      marker(ctx, s.coordinate.xSurface, s.coordinate.ySurface, '#6ee7a8', 6, 'circle', true);
      label(ctx, `${fmt(s.coordinate.xMm, 1)}, ${fmt(s.coordinate.yMm, 1)} mm`, s.coordinate.xSurface + 9, s.coordinate.ySurface, '#6ee7a8', 'left', 10);
    }

    if (ripple) {
      const age = performance.now() - ripple.at;
      if (age > 900) ripple = null;
      else {
        ctx.save();
        ctx.strokeStyle = `rgba(110,231,168,${1 - age / 900})`;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(ripple.x, ripple.y, 8 + (age / 900) * 26, 0, Math.PI * 2);
        ctx.stroke();
        ctx.restore();
      }
    }
  }

  function updatePanels() {
    const s = ctl.status();
    clear(readout);
    const cell = s.cells[s.index];
    const mmPerPxX = calibration.get('screen.widthMm') / (ctl.surface.w || 1);
    const mmPerPxY = calibration.get('screen.heightMm') / (ctl.surface.h || 1);
    [
      ['Selection', s.active ? `level ${s.level} / ${s.depth}` : s.done ? 'coordinate resolved' : 'idle'],
      ['Highlighted region', cell ? `${cell.quadrant} · ${fmt(cell.w * mmPerPxX, 0)} × ${fmt(cell.h * mmPerPxY, 0)} mm` : '—'],
      ['Activations', String(s.activations)],
      ['Coordinate', s.coordinate ? `${fmt(s.coordinate.xMm, 1)}, ${fmt(s.coordinate.yMm, 1)} mm` : '—'],
      ['Screen pixels', s.coordinate ? `${fmt(s.coordinate.xPx, 0)}, ${fmt(s.coordinate.yPx, 0)} px` : '—'],
      ['Boundary guidance', s.boundaryGuided ? 'element boundaries preferred' : 'geometric midpoints'],
    ].forEach(([k, v]) => readout.appendChild(h('div', { class: 'kv' }, h('span', { class: 'kv-label' }, k), h('span', { class: 'kv-value' }, v))));

    clear(pathList);
    if (!s.path.length) pathList.appendChild(h('li', { class: 'muted' }, 'No subdivision yet.'));
    s.path.forEach((p) => {
      pathList.appendChild(h('li', {}, `Level ${p.level} → ${p.quadrant}`));
    });

    const summary = map.describe();
    clear(mapSummary);
    [
      ['Map size', `${fmt(summary.size.w, 0)} × ${fmt(summary.size.h, 0)} px`],
      ['Layers', Object.entries(summary.counts).map(([k, v]) => `${k} ${v}`).join(' · ') || '—'],
      ['Candidate targets', String(map.candidateTargets().length)],
    ].forEach(([k, v]) => mapSummary.appendChild(h('div', { class: 'kv' }, h('span', { class: 'kv-label' }, k), h('span', { class: 'kv-value' }, v))));
  }

  function bigSwitch() {
    if (!ctl.active) {
      ctl.start();
    } else if (ctl.config.mode === 'auto') {
      ctl.select();
    } else {
      ctl.advance();
    }
    updatePanels();
  }

  function guidedDemo() {
    refreshMap();
    ctl.start();
    const targets = map.candidateTargets();
    const target = targets.find((t) => t.id === 'demo-primary') || targets[0];
    if (!target) return;
    log.add('switch', `Guided demonstration — resolving the coordinate of "${target.label}"`, { target: target.label });
    let guard = 0;
    const step = () => {
      if (!ctl.active || guard > 12 || root.offsetParent === null) return;
      guard += 1;
      const cells = ctl.cells;
      let idx = cells.findIndex(
        (c) => target.x >= c.x && target.x <= c.x + c.w && target.y >= c.y && target.y <= c.y + c.h,
      );
      if (idx < 0) idx = 0;
      ctl.index = idx;
      ctl.emit();
      setTimeout(() => {
        if (!ctl.active || root.offsetParent === null) return;
        ctl.select();
        if (ctl.active) setTimeout(step, 260);
      }, 260);
    };
    step();
  }

  document.addEventListener('keydown', (event) => {
    if (event.code !== 'Space' || root.offsetParent === null) return;
    event.preventDefault();
    bigSwitch();
  });

  window.addEventListener('resize', () => {
    if (root.offsetParent === null) return;
    refreshMap();
  });

  root.appendChild(
    sectionGrid(
      panel(
        'Single fixed switch',
        'The switch supplies only an activation. Progressive subdivision supplies the coordinate.',
        wrap,
        resultLine,
      ),
      panel(
        'Switch controls',
        'One switch is sufficient: in auto-scan an activation selects the highlighted region.',
        h('div', { class: 'btn-row' },
          btn('Start selection', () => { ctl.start(); updatePanels(); }, { variant: 'primary', id: 'switch-start' }),
          btn('Guided demo → Primary action', guidedDemo, { id: 'switch-guided' }),
          btn('Reset', () => { ctl.reset(); updatePanels(); }, { id: 'switch-reset' })),
        h(
          'div',
          { class: 'switch-button-row' },
          h('button', { class: 'switch-button', id: 'switch-activate', type: 'button', onclick: bigSwitch }, 'SWITCH'),
          btn('Select highlighted', () => { ctl.select(); updatePanels(); }, { id: 'switch-select' }),
        ),
        h('div', { class: 'control' }, h('span', {}, 'Mode'), modeSelect),
        h('div', { class: 'control' }, h('span', {}, 'Depth'), depthSelect),
        h('div', { class: 'control' }, h('span', {}, 'Auto-scan interval'), scanMs, h('span', { class: 'unit' }, 'ms')),
        h('label', { class: 'toggle' }, boundary, 'Boundary-guided subdivision'),
        h('p', { class: 'note' }, 'Space also activates the switch. Boundary guidance prefers element edges but does not restrict selection to existing controls.'),
      ),
      panel('Selection state', 'Coordinate resolution and the final click.', readout, h('h3', {}, 'Subdivision path'), pathList),
      panel(
        'Referential map layers',
        'Physical, visual and interaction boundaries stay distinct.',
        layerRow,
        mapSummary,
      ),
    ),
  );

  requestAnimationFrame(() => {
    refreshMap();
    drawOverlay();
  });

  return {
    onShow() {
      requestAnimationFrame(() => {
        refreshMap();
        drawOverlay();
      });
    },
    tick() {
      if (root.offsetParent === null) return;
      const now = performance.now();
      if (ctl.active && ctl.config.mode === 'auto' && now - lastScan > ctl.config.scanMs) {
        lastScan = now;
        ctl.advance();
        updatePanels();
      }
      drawOverlay();
    },
  };
}
