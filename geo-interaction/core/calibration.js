// Layer A — physical and anatomical calibration.
//
// Every stored value carries its provenance. Population reference values and
// unset defaults are never presented as individual measurements; the user (or
// the reference profile) records real measurements, which raises completeness.

import { clamp } from './util.js';

export const SOURCE_LABELS = {
  measured: 'measured',
  population: 'population estimate',
  derived: 'derived',
  default: 'unset default',
};

export const FIELD_SPECS = [
  // Screen ---------------------------------------------------------------
  { path: 'screen.widthMm', label: 'Physical width', unit: 'mm', group: 'Screen', def: 344, step: 1, min: 50, max: 2000 },
  { path: 'screen.heightMm', label: 'Physical height', unit: 'mm', group: 'Screen', def: 194, step: 1, min: 30, max: 1500 },
  { path: 'screen.widthPx', label: 'Pixel width', unit: 'px', group: 'Screen', def: 2560, step: 1, min: 320, max: 10000 },
  { path: 'screen.heightPx', label: 'Pixel height', unit: 'px', group: 'Screen', def: 1440, step: 1, min: 240, max: 10000 },
  // Camera ---------------------------------------------------------------
  { path: 'camera.backMm', label: 'Behind screen plane', unit: 'mm', group: 'Camera', def: 18, step: 1, min: -50, max: 200 },
  { path: 'camera.offsetXMm', label: 'Lateral offset', unit: 'mm', group: 'Camera', def: 0, step: 1, min: -200, max: 200 },
  { path: 'camera.offsetYMm', label: 'Vertical offset', unit: 'mm', group: 'Camera', def: -6, step: 1, min: -200, max: 200 },
  { path: 'camera.hFovDeg', label: 'Horizontal field of view', unit: '°', group: 'Camera', def: 52, step: 0.5, min: 15, max: 150 },
  { path: 'camera.sensorWidthPx', label: 'Sensor width', unit: 'px', group: 'Camera', def: 1920, step: 1, min: 320, max: 8000 },
  { path: 'camera.sensorHeightPx', label: 'Sensor height', unit: 'px', group: 'Camera', def: 1080, step: 1, min: 240, max: 6000 },
  { path: 'camera.distortionK1', label: 'Radial distortion k₁', unit: '', group: 'Camera', def: 0.25, step: 0.01, min: -0.6, max: 0.6 },
  // Distances ------------------------------------------------------------
  { path: 'distances.eyeToScreenMm', label: 'Eye to screen', unit: 'mm', group: 'Distances', def: 550, step: 5, min: 150, max: 1500 },
  { path: 'distances.cameraToUserMm', label: 'Camera to user', unit: 'mm', group: 'Distances', def: 568, step: 5, min: 150, max: 1600 },
  // Anatomy --------------------------------------------------------------
  { path: 'anatomy.irisLeftMm', label: 'Left iris diameter', unit: 'mm', group: 'Anatomy', def: 11.7, step: 0.1, min: 5, max: 20, population: true },
  { path: 'anatomy.irisRightMm', label: 'Right iris diameter', unit: 'mm', group: 'Anatomy', def: 11.7, step: 0.1, min: 5, max: 20, population: true },
  { path: 'anatomy.interIrisMm', label: 'Inter-iris distance', unit: 'mm', group: 'Anatomy', def: 63.0, step: 0.1, min: 30, max: 110, population: true },
  { path: 'anatomy.eyeWidthMm', label: 'Palpebral fissure width', unit: 'mm', group: 'Anatomy', def: 30.0, step: 0.1, min: 10, max: 50, population: true },
  { path: 'anatomy.noseBridgeMm', label: 'Nose bridge width', unit: 'mm', group: 'Anatomy', def: 18.0, step: 0.1, min: 5, max: 40, population: true },
  { path: 'anatomy.middlePhalanxMm', label: 'Index middle phalanx', unit: 'mm', group: 'Anatomy', def: 25.0, step: 0.1, min: 10, max: 45, population: true },
];

export const GROUPS = ['Screen', 'Camera', 'Distances', 'Anatomy'];

// An individual (not population) reference profile, used to demonstrate a
// complete calibration without pretending to have measured the viewer.
export const REFERENCE_PROFILE = {
  'screen.widthMm': 297,
  'screen.heightMm': 185,
  'screen.widthPx': 2360,
  'screen.heightPx': 1640,
  'camera.backMm': 16,
  'camera.offsetXMm': 0,
  'camera.offsetYMm': -5,
  'camera.hFovDeg': 46,
  'camera.sensorWidthPx': 1920,
  'camera.sensorHeightPx': 1440,
  'camera.distortionK1': 0.22,
  'distances.eyeToScreenMm': 585,
  'distances.cameraToUserMm': 601,
  'anatomy.irisLeftMm': 11.9,
  'anatomy.irisRightMm': 11.8,
  'anatomy.interIrisMm': 62.4,
  'anatomy.eyeWidthMm': 29.5,
  'anatomy.noseBridgeMm': 17.2,
  'anatomy.middlePhalanxMm': 26.5,
};

// Anthropometric ratio: index middle phalanx length / iris diameter.
// Reference value only — the individual measurement always wins.
export const PHALANX_IRIS_RATIO = 2.25;

export class Calibration {
  constructor(log) {
    this.log = log;
    this.values = new Map();
    this.listeners = new Set();
    this.resetToDefaults();
  }

  resetToDefaults() {
    this.values.clear();
    for (const spec of FIELD_SPECS) {
      this.values.set(spec.path, {
        value: spec.def,
        source: spec.population ? 'population' : 'default',
        confidence: spec.population ? 0.35 : 0.15,
      });
    }
    this.emit();
    this.log?.add('calibration', 'Calibration reset to population reference and unset defaults');
  }

  applyReferenceProfile() {
    for (const spec of FIELD_SPECS) {
      const v = REFERENCE_PROFILE[spec.path];
      this.values.set(spec.path, {
        value: v,
        source: 'measured',
        confidence: 0.92,
      });
    }
    this.emit();
    this.log?.add(
      'calibration',
      'Reference individual calibration applied — every field recorded as measured',
      { profile: 'reference-individual' },
    );
  }

  get(path) {
    const rec = this.values.get(path);
    return rec ? rec.value : 0;
  }

  record(path) {
    return this.values.get(path) || { value: 0, source: 'default', confidence: 0 };
  }

  set(path, value, { source = 'measured', confidence = 0.9 } = {}) {
    const spec = FIELD_SPECS.find((s) => s.path === path);
    if (!spec) return;
    const numeric = Number(value);
    if (!Number.isFinite(numeric)) return;
    this.values.set(path, {
      value: clamp(numeric, spec.min, spec.max),
      source,
      confidence,
    });
    this.emit();
  }

  markMeasured(path, confidence = 0.9) {
    const rec = this.record(path);
    this.set(path, rec.value, { source: 'measured', confidence });
  }

  onChange(fn) {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  emit() {
    this.listeners.forEach((fn) => fn(this));
  }

  // Share of required fields that are individual measurements (or derived
  // from them) rather than population estimates / unset defaults.
  completeness() {
    const measured = FIELD_SPECS.filter((s) => {
      const rec = this.record(s.path);
      return rec.source === 'measured' || rec.source === 'derived';
    }).length;
    return measured / FIELD_SPECS.length;
  }

  confidence() {
    let sum = 0;
    for (const spec of FIELD_SPECS) sum += this.record(spec.path).confidence;
    return sum / FIELD_SPECS.length;
  }

  provenanceSummary() {
    const out = { measured: 0, population: 0, derived: 0, default: 0 };
    for (const spec of FIELD_SPECS) {
      const rec = this.record(spec.path);
      out[rec.source] = (out[rec.source] || 0) + 1;
    }
    return out;
  }

  // Values that are always computed from the fundamental measurements and are
  // therefore never stored redundantly.
  get derived() {
    const wMm = this.get('screen.widthMm');
    const hMm = this.get('screen.heightMm');
    const wPx = this.get('screen.widthPx');
    const hPx = this.get('screen.heightPx');
    const pxPerMmX = wPx / wMm;
    const pxPerMmY = hPx / hMm;
    const eyeToScreen = this.get('distances.eyeToScreenMm');
    const back = this.get('camera.backMm');
    const eyeToCamera = eyeToScreen + back;
    const hFov = this.get('camera.hFovDeg');
    const fPx = this.get('camera.sensorWidthPx') / 2 / Math.tan((hFov * Math.PI) / 360);
    const irisMean = (this.get('anatomy.irisLeftMm') + this.get('anatomy.irisRightMm')) / 2;
    const phalanx = this.get('anatomy.middlePhalanxMm');
    const irisFromPhalanx = phalanx / PHALANX_IRIS_RATIO;
    const irisCrossCheckPct = ((irisMean - irisFromPhalanx) / irisFromPhalanx) * 100;
    const irisImagePx = irisMean * (fPx / eyeToCamera);
    const sensorAspect = this.get('camera.sensorWidthPx') / this.get('camera.sensorHeightPx');
    return {
      pxPerMmX,
      pxPerMmY,
      mmPerPxX: 1 / pxPerMmX,
      mmPerPxY: 1 / pxPerMmY,
      eyeToCameraMm: eyeToCamera,
      cameraToUserMm: this.get('distances.cameraToUserMm'),
      cameraToUserDeltaMm: this.get('distances.cameraToUserMm') - eyeToCamera,
      focalPx: fPx,
      irisMeanMm: irisMean,
      irisFromPhalanxMm: irisFromPhalanx,
      irisCrossCheckPct,
      irisImagePx,
      sensorAspect,
      gridUnitMm: 1,
      gridUnitPxX: pxPerMmX,
      gridUnitPxY: pxPerMmY,
    };
  }

  toJSON() {
    const out = {};
    for (const spec of FIELD_SPECS) out[spec.path] = this.record(spec.path);
    return { fields: out, completeness: this.completeness(), confidence: this.confidence() };
  }
}
