// Layer B + C — geometric measurement field and predictive simulation.
//
// The field is a millimetre plane: the screen's physical geometry, the camera's
// coverage at the user's distance, and the anatomical reference geometry all
// live in the same calibrated space. Predictions come from the calibration
// model; observations come from a simulated camera image (pinhole scale,
// radial distortion, measurement noise) mapped back through the anatomical
// scale. Predictions are never silently promoted to measurements.

import { clamp, deg, idHash, noise, round } from './util.js';

export const ANCHOR_LAYER_LABEL = {
  fixed: 'fixed anchor',
  measured: 'measured anchor',
  derived: 'derived anchor',
  predicted: 'predicted anchor',
};

export function buildAnchors(cal) {
  const w = cal.get('screen.widthMm');
  const h = cal.get('screen.heightMm');
  const inter = cal.get('anatomy.interIrisMm');
  const irisL = cal.get('anatomy.irisLeftMm');
  const irisR = cal.get('anatomy.irisRightMm');

  return [
    { id: 'noseBridge', label: 'Nose bridge', kind: 'face', layer: 'fixed', x: 0, y: 0, z: 0, confidence: 1 },
    { id: 'irisLeft', label: 'Left iris centre', kind: 'face', layer: 'measured', x: -inter / 2, y: 0, z: 2, confidence: 0.9 },
    { id: 'irisRight', label: 'Right iris centre', kind: 'face', layer: 'measured', x: inter / 2, y: 0, z: 2, confidence: 0.9 },
    { id: 'irisLeftOuter', label: 'Left iris outer boundary', kind: 'face', layer: 'derived', x: -inter / 2 - irisL / 2, y: 0, z: 2, confidence: 0.8 },
    { id: 'irisRightOuter', label: 'Right iris outer boundary', kind: 'face', layer: 'derived', x: inter / 2 + irisR / 2, y: 0, z: 2, confidence: 0.8 },
    { id: 'browLeft', label: 'Left brow ridge', kind: 'face', layer: 'predicted', x: -26, y: -20, z: 1, confidence: 0.6 },
    { id: 'browRight', label: 'Right brow ridge', kind: 'face', layer: 'predicted', x: 26, y: -20, z: 1, confidence: 0.6 },
    { id: 'earLeft', label: 'Left ear reference', kind: 'face', layer: 'predicted', x: -78, y: 8, z: -10, confidence: 0.45 },
    { id: 'earRight', label: 'Right ear reference', kind: 'face', layer: 'predicted', x: 78, y: 8, z: -10, confidence: 0.45 },
    { id: 'templeLeft', label: 'Left temple', kind: 'face', layer: 'predicted', x: -92, y: -14, z: -14, confidence: 0.4 },
    { id: 'templeRight', label: 'Right temple', kind: 'face', layer: 'predicted', x: 92, y: -14, z: -14, confidence: 0.4 },
    { id: 'shoulderLeft', label: 'Left shoulder reference', kind: 'face', layer: 'predicted', x: -260, y: 150, z: -120, confidence: 0.3 },
    { id: 'shoulderRight', label: 'Right shoulder reference', kind: 'face', layer: 'predicted', x: 260, y: 150, z: -120, confidence: 0.3 },
    { id: 'jawLeft', label: 'Left jaw', kind: 'face', layer: 'predicted', x: -58, y: 78, z: -18, confidence: 0.45 },
    { id: 'jawRight', label: 'Right jaw', kind: 'face', layer: 'predicted', x: 58, y: 78, z: -18, confidence: 0.45 },
    { id: 'chinCenter', label: 'Chin centre', kind: 'face', layer: 'predicted', x: 0, y: 96, z: -16, confidence: 0.45 },
    { id: 'fieldLeft', label: 'Field boundary L', kind: 'face', layer: 'predicted', x: -420, y: 0, z: -40, confidence: 0.25 },
    { id: 'fieldRight', label: 'Field boundary R', kind: 'face', layer: 'predicted', x: 420, y: 0, z: -40, confidence: 0.25 },
    { id: 'screenTL', label: 'Screen corner TL', kind: 'screen', layer: 'fixed', x: -w / 2, y: -h / 2, z: 0, confidence: 1 },
    { id: 'screenTR', label: 'Screen corner TR', kind: 'screen', layer: 'fixed', x: w / 2, y: -h / 2, z: 0, confidence: 1 },
    { id: 'screenBL', label: 'Screen corner BL', kind: 'screen', layer: 'fixed', x: -w / 2, y: h / 2, z: 0, confidence: 1 },
    { id: 'screenBR', label: 'Screen corner BR', kind: 'screen', layer: 'fixed', x: w / 2, y: h / 2, z: 0, confidence: 1 },
  ];
}

export class GeometryField {
  constructor(calibration, log) {
    this.cal = calibration;
    this.log = log;
    this.view = {
      yawDeg: 8,
      pitchDeg: -3,
      eyeDistanceMm: null,
      distortionCorrection: true,
      toleranceMm: 3,
      stalenessMs: 900,
    };
    this.observations = new Map();
    this.deviationHistory = new Map();
    this.status = new Map();
    this.anchors = buildAnchors(calibration);
    this.rows = [];
    this.captureIndex = 0;
    this.lastCaptureAt = 0;
    this.lastCaptureReason = null;
    this.listeners = new Set();
  }

  onChange(fn) {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  emit() {
    this.listeners.forEach((fn) => fn(this));
  }

  get eyeDistanceMm() {
    return this.view.eyeDistanceMm ?? this.cal.get('distances.eyeToScreenMm');
  }

  get focalPx() {
    return this.cal.derived.focalPx;
  }

  cameraAxis() {
    return {
      x: this.cal.get('camera.offsetXMm'),
      y: this.cal.get('camera.offsetYMm'),
    };
  }

  screenRect() {
    const w = this.cal.get('screen.widthMm');
    const h = this.cal.get('screen.heightMm');
    return { x: -w / 2, y: -h / 2, w, h };
  }

  // Region of the measurement field the camera sensor covers at the user's
  // current distance: the field of view expressed in millimetres.
  cameraFrame() {
    const d = this.eyeDistanceMm + this.cal.get('camera.backMm');
    const hFov = deg(this.cal.get('camera.hFovDeg'));
    const aspect = this.cal.get('camera.sensorWidthPx') / this.cal.get('camera.sensorHeightPx');
    const w = 2 * Math.tan(hFov / 2) * d;
    const h = w / aspect;
    const axis = this.cameraAxis();
    return { x: axis.x - w / 2, y: axis.y - h / 2, w, h };
  }

  // The field always extends beyond both the screen and the camera frame.
  fieldExtent() {
    const screen = this.screenRect();
    const frame = this.cameraFrame();
    const halfW = Math.max(screen.w, frame.w) * 0.56;
    const halfH = Math.max(screen.h, frame.h) * 0.56;
    return { halfW, halfH };
  }

  // Field position of an anchor. Anatomical anchors are expressed in their
  // calibrated millimetre offsets from the nose bridge, rotated by the current
  // viewing angle; screen anchors are fixed physical geometry.
  fieldPointFor(anchor) {
    if (anchor.kind === 'screen') return { xMm: anchor.x, yMm: anchor.y };
    const yaw = deg(this.view.yawDeg);
    const pitch = deg(this.view.pitchDeg);
    const x1 = anchor.x * Math.cos(yaw) + anchor.z * Math.sin(yaw);
    const z1 = -anchor.x * Math.sin(yaw) + anchor.z * Math.cos(yaw);
    const y2 = anchor.y * Math.cos(pitch) - z1 * Math.sin(pitch);
    return { xMm: x1, yMm: y2 };
  }

  inCameraFrame(anchor, point) {
    // The camera looks at the user; the screen plane itself is not observable.
    if (anchor.kind === 'screen') return false;
    const f = this.cameraFrame();
    return point.xMm >= f.x && point.xMm <= f.x + f.w && point.yMm >= f.y && point.yMm <= f.y + f.h;
  }

  // Simulated camera measurement of one anchor: project into the sensor image,
  // add lens deformation and noise, then map back through the anatomical scale.
  observe(anchor, point) {
    const d = this.eyeDistanceMm + this.cal.get('camera.backMm');
    const f = this.focalPx;
    const scale = f / d; // px per mm at the user's distance
    const axis = this.cameraAxis();
    const u = (point.xMm - axis.x) * scale;
    const v = (point.yMm - axis.y) * scale;
    const k1 = this.cal.get('camera.distortionK1');
    const r2 = (u * u + v * v) / (f * f);
    const lens = 1 + k1 * r2;
    const ud = u * lens + noise(idHash(anchor.id), this.captureIndex, 1.1);
    const vd = v * lens + noise(idHash(anchor.id) + 91, this.captureIndex, 1.1);
    let uu = ud;
    let vv = vd;
    if (this.view.distortionCorrection) {
      for (let i = 0; i < 6; i += 1) {
        const rr = (uu * uu + vv * vv) / (f * f);
        const correction = 1 + k1 * rr;
        uu = ud / correction;
        vv = vd / correction;
      }
    }
    return {
      xMm: uu / scale + axis.x,
      yMm: vv / scale + axis.y,
    };
  }

  capture(reason = 'manual') {
    this.captureIndex += 1;
    const at = performance.now();
    let observed = 0;
    let skipped = 0;
    for (const anchor of this.anchors) {
      if (anchor.layer === 'derived' || anchor.kind === 'screen') continue;
      const point = this.fieldPointFor(anchor);
      if (!this.inCameraFrame(anchor, point)) {
        skipped += 1;
        continue;
      }
      const measurement = this.observe(anchor, point);
      this.observations.set(anchor.id, {
        xMm: measurement.xMm,
        yMm: measurement.yMm,
        at,
        confidence: 0.85,
        reason,
        frame: this.captureIndex,
      });
      observed += 1;
    }
    this.lastCaptureAt = at;
    this.lastCaptureReason = reason;
    this.log.add('geometry', `Observation set captured (${reason})`, {
      frame: this.captureIndex,
      observed,
      skipped,
      distortionCorrection: this.view.distortionCorrection,
      distanceMm: Math.round(this.eyeDistanceMm),
    });
    this.update();
    return { observed, skipped };
  }

  update() {
    this.anchors = buildAnchors(this.cal);
    const now = performance.now();
    const screen = this.screenRect();

    const rows = this.anchors.map((anchor) => {
      const point = this.fieldPointFor(anchor);
      const frame = this.cameraFrame();
      const inCameraFrame = this.inCameraFrame(anchor, point);
      const observed = this.observations.get(anchor.id) || null;
      const age = observed ? now - observed.at : Infinity;
      const fresh = age <= this.view.stalenessMs;

      let status;
      if (anchor.layer === 'derived') status = 'derived';
      else if (observed && fresh && inCameraFrame) status = 'observed';
      else status = 'predicted';

      let deviation = null;
      let reconciled = { ...point };
      if (observed && inCameraFrame) {
        deviation = Math.hypot(observed.xMm - point.xMm, observed.yMm - point.yMm);
        const weight = clamp((observed.confidence ?? 0.8) * (fresh ? 1 : 0.4), 0, 1);
        const gain = weight * 0.6;
        reconciled = {
          xMm: point.xMm + (observed.xMm - point.xMm) * gain,
          yMm: point.yMm + (observed.yMm - point.yMm) * gain,
        };
        if (deviation > this.view.toleranceMm) status = 'uncertain';
        if (fresh) {
          const hist = this.deviationHistory.get(anchor.id) || [];
          hist.push(deviation);
          if (hist.length > 80) hist.shift();
          this.deviationHistory.set(anchor.id, hist);
        }
      }

      const inScreen = Math.abs(point.xMm) <= screen.w / 2 && Math.abs(point.yMm) <= screen.h / 2;

      return {
        anchor,
        point,
        predicted: point,
        observed,
        reconciled,
        deviation,
        status,
        camera: { frame, inFrame: inCameraFrame },
        inScreen,
        inCameraFrame,
        age,
        uncertaintyMm: status === 'uncertain' ? deviation : null,
      };
    });

    for (const row of rows) {
      const prev = this.status.get(row.anchor.id);
      if (prev !== row.status) {
        if (prev === 'observed' && row.status === 'predicted') {
          this.log.add('geometry', `${row.anchor.label} left the camera frame — predicted position retained`, {
            anchor: row.anchor.id,
            predictedMm: { x: round(row.point.xMm, 1), y: round(row.point.yMm, 1) },
          });
        } else if (row.status === 'uncertain') {
          this.log.add('geometry', `${row.anchor.label} deviates beyond tolerance`, {
            anchor: row.anchor.id,
            deviationMm: round(row.deviation, 2),
            toleranceMm: this.view.toleranceMm,
          });
        } else if (prev === 'uncertain' && row.status === 'observed') {
          this.log.add('geometry', `${row.anchor.label} back within tolerance`, {
            anchor: row.anchor.id,
            deviationMm: round(row.deviation, 2),
          });
        }
        this.status.set(row.anchor.id, row.status);
      }
    }

    this.rows = rows;
    this.emit();
    return rows;
  }

  setView(patch) {
    Object.assign(this.view, patch);
    this.update();
  }

  summary() {
    const counts = { observed: 0, predicted: 0, derived: 0, uncertain: 0 };
    for (const row of this.rows) counts[row.status] += 1;
    const outOfFrame = this.rows.filter(
      (r) => r.anchor.kind === 'face' && !r.inCameraFrame,
    );
    const deviations = this.rows.map((r) => r.deviation).filter((d) => Number.isFinite(d));
    const maxDeviation = deviations.length ? Math.max(...deviations) : null;
    const meanDeviation = deviations.length
      ? deviations.reduce((a, b) => a + b, 0) / deviations.length
      : null;
    return {
      counts,
      outOfFrame: outOfFrame.map((r) => r.anchor.label),
      outOfFrameRows: outOfFrame,
      maxDeviationMm: maxDeviation,
      meanDeviationMm: meanDeviation,
      toleranceMm: this.view.toleranceMm,
      lastCaptureReason: this.lastCaptureReason,
      captureIndex: this.captureIndex,
      observedInFrame: this.rows.filter((r) => r.inCameraFrame && r.status !== 'derived').length,
    };
  }

  describeDeviation(row) {
    if (!Number.isFinite(row.deviation)) return '—';
    return `${row.deviation.toFixed(2)} mm`;
  }
}
