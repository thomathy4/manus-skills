// Calibration view — physical screen, camera, distances and individual anatomy.

import {
  FIELD_SPECS,
  GROUPS,
  PHALANX_IRIS_RATIO,
  SOURCE_LABELS,
} from '../core/calibration.js';
import { fmt } from '../core/util.js';
import {
  badge,
  bar,
  btn,
  clear,
  h,
  kv,
  panel,
  sectionGrid,
  stat,
} from './dom.js';

const TONE = {
  measured: 'good',
  derived: 'derived',
  population: 'warn',
  default: 'muted',
};

export function mountCalibration(root, app) {
  const { calibration, log } = app;
  const inputs = new Map();
  const badges = new Map();

  const completenessValue = h('strong', { class: 'big' }, '0%');
  const completenessBar = bar(0);
  const confidenceValue = h('strong', { class: 'big' }, '0%');
  const provenanceLine = h('p', { class: 'muted' }, '');
  const derivedBox = h('div', { class: 'kv-list' });
  const crossCheck = h('div', { class: 'kv-list' });

  const groups = GROUPS.map((group) => {
    const rows = FIELD_SPECS.filter((s) => s.group === group).map((spec) => {
      const input = h('input', {
        type: 'number',
        class: 'num',
        value: calibration.get(spec.path),
        min: spec.min,
        max: spec.max,
        step: spec.step,
      });
      input.addEventListener('input', () => {
        calibration.set(spec.path, input.value, { source: 'measured', confidence: 0.9 });
      });
      const sourceBadge = badge('', TONE.default);
      sourceBadge.style.cursor = 'pointer';
      sourceBadge.title = 'Record this value as an individual measurement';
      sourceBadge.addEventListener('click', () => {
        calibration.markMeasured(spec.path, 0.9);
        log.add('calibration', `Recorded ${spec.label} as an individual measurement`, {
          field: spec.path,
          value: calibration.get(spec.path),
        });
      });
      inputs.set(spec.path, input);
      badges.set(spec.path, sourceBadge);
      return h(
        'div',
        { class: 'measure-row' },
        h('span', { class: 'measure-label' }, spec.label),
        h('span', { class: 'measure-input' }, input, h('span', { class: 'unit' }, spec.unit)),
        sourceBadge,
      );
    });
    return h(
      'div',
      { class: 'measure-group' },
      h('h3', {}, group),
      ...rows,
    );
  });

  const anchorList = h('div', { class: 'kv-list' });
  const referenceList = h('div', { class: 'kv-list' });

  function update() {
    const pct = calibration.completeness();
    const conf = calibration.confidence();
    completenessValue.textContent = `${Math.round(pct * 100)}%`;
    completenessBar.setValue(pct);
    confidenceValue.textContent = `${Math.round(conf * 100)}%`;
    const prov = calibration.provenanceSummary();
    provenanceLine.textContent =
      `${prov.measured} measured · ${prov.population} population estimates · ` +
      `${prov.derived} derived · ${prov.default} unset defaults`;

    for (const spec of FIELD_SPECS) {
      const rec = calibration.record(spec.path);
      const input = inputs.get(spec.path);
      if (document.activeElement !== input) input.value = rec.value;
      const b = badges.get(spec.path);
      b.textContent = SOURCE_LABELS[rec.source] || rec.source;
      b.className = `badge badge-${TONE[rec.source] || 'muted'}`;
    }

    const d = calibration.derived;
    clear(derivedBox);
    [
      ['Pixel density', `${fmt(d.pxPerMmX, 2)} px/mm horizontally`],
      ['Grid unit', `1 mm = ${fmt(d.gridUnitPxX, 2)} × ${fmt(d.gridUnitPxY, 2)} px`],
      ['Eye to camera', `${fmt(d.eyeToCameraMm, 0)} mm`],
      ['Camera-to-user check', `${fmt(d.cameraToUserDeltaMm, 1)} mm from eye + camera offset`],
      ['Focal length', `${fmt(d.focalPx, 0)} px`],
      ['Iris image scale', `${fmt(d.irisImagePx, 1)} px diameter at the eye distance`],
    ].forEach(([k, v]) => derivedBox.appendChild(kv(k, v)));

    clear(crossCheck);
    [
      ['Measured mean iris diameter', `${fmt(d.irisMeanMm, 2)} mm`],
      [`Population ratio (phalanx ÷ ${PHALANX_IRIS_RATIO})`, `${fmt(d.irisFromPhalanxMm, 2)} mm`],
      ['Difference', `${fmt(d.irisCrossCheckPct, 1)} %`],
    ].forEach(([k, v]) => crossCheck.appendChild(kv(k, v)));

    clear(anchorList);
    const fixed = [
      ['Screen corner TL', `x ${fmt(-calibration.get('screen.widthMm') / 2, 0)} · y ${fmt(-calibration.get('screen.heightMm') / 2, 0)} mm`],
      ['Screen corner TR', `x ${fmt(calibration.get('screen.widthMm') / 2, 0)} · y ${fmt(-calibration.get('screen.heightMm') / 2, 0)} mm`],
      ['Screen corner BL', `x ${fmt(-calibration.get('screen.widthMm') / 2, 0)} · y ${fmt(calibration.get('screen.heightMm') / 2, 0)} mm`],
      ['Screen corner BR', `x ${fmt(calibration.get('screen.widthMm') / 2, 0)} · y ${fmt(calibration.get('screen.heightMm') / 2, 0)} mm`],
      ['Nose bridge anchor', 'x 0 · y 0 · fixed facial reference'],
    ];
    fixed.forEach(([k, v]) => anchorList.appendChild(kv(k, v)));

    clear(referenceList);
    [
      ['Vertical midline', 'through the nose bridge anchor, x = 0 mm'],
      ['Inter-iris line', 'left iris centre → right iris centre'],
      ['Screen diagonals', 'calibrated against the physical screen corners'],
      ['Grid origin', 'screen centre, unit = 1 mm'],
    ].forEach(([k, v]) => referenceList.appendChild(kv(k, v)));
  }

  root.appendChild(
    sectionGrid(
      panel(
        'Calibration completeness',
        'Population estimates and unset defaults are never counted as individual measurements.',
        h('div', { class: 'stat-row' }, stat('Measured fields', completenessValue), stat('Mean confidence', confidenceValue)),
        completenessBar,
        provenanceLine,
        h(
          'div',
          { class: 'btn-row' },
          btn('Apply reference individual calibration', () => calibration.applyReferenceProfile(), { variant: 'primary' }),
          btn('Reset to population defaults', () => calibration.resetToDefaults()),
        ),
        h('p', { class: 'note' }, 'The reference profile is example individual data for demonstrating the workflow. Edit any value to record your own measurement.'),
      ),
      panel(
        'Anatomical scale cross-check',
        'The index finger middle phalanx is an additional anatomical scale reference.',
        crossCheck,
        h('p', { class: 'note' }, 'Population ratio only. An individual phalanx measurement always takes precedence over the reference ratio.'),
      ),
      panel(
        'Physical & anatomical measurements',
        'Each value carries its own provenance. Click a badge to record it as measured.',
        ...groups,
      ),
      panel(
        'Fixed anchors & reference lines',
        'Known screen geometry plus the facial reference anchor.',
        anchorList,
        h('h3', {}, 'Reference lines'),
        referenceList,
      ),
      panel('Derived values', 'Calculated from the fundamental measurements — never stored redundantly.', derivedBox),
    ),
  );

  calibration.onChange(update);
  update();

  return {
    onShow() {
      update();
    },
    tick() {},
  };
}
