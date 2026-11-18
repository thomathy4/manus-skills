// Layer D — capture and observation scheduling.
//
// The camera is never assumed to run continuously. The controller owns only
// *when* observations are requested; measurement happens in the geometry
// field, and prediction stays independent of both.

import { clamp } from './util.js';

export const REASON_LABEL = {
  initial: 'initial motion',
  transition: 'transition',
  dwell: 'dwell burst',
  manual: 'manual',
};

export class CaptureController {
  constructor(log, field) {
    this.log = log;
    this.field = field;
    this.config = {
      baseIntervalMs: 250, // one capture every 1/240 minute
      initialCount: 5,
      initialSpacingMs: 250,
      transitionWindowMs: 60000,
      dwellBurstCount: 8,
      dwellBurstIntervalMs: 60,
      saccadeSpeedMmPerSec: 300,
      scanSpeedMmPerSec: 300,
    };
    this.speed = 1;
    this.running = true;
    this.mode = 'idle';
    this.clock = 0;
    this.lastReal = performance.now();
    this.queue = [];
    this.lastCaptureAt = null;
    this.lastCaptureReason = null;
    this.windowStartedAt = null;
    this.transitionTargets = [];
    this.transitionIndex = 0;
    this.dwellTarget = null;
    this.captures = [];
    this.candidates = [];
    this.listeners = new Set();
    this.counts = { initial: 0, transition: 0, dwell: 0, manual: 0 };
  }

  onChange(fn) {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  emit() {
    this.listeners.forEach((fn) => fn(this));
  }

  setCandidates(list) {
    this.candidates = list.map((c, i) => ({ ...c, order: i }));
    this.emit();
  }

  start() {
    if (this.running) return;
    this.running = true;
    this.lastReal = performance.now();
    this.log.add('capture', 'Capture controller resumed');
    this.emit();
  }

  stop() {
    if (!this.running) return;
    this.running = false;
    this.queue = [];
    this.mode = 'idle';
    this.log.add('capture', 'Capture controller stopped — no observations are being requested');
    this.emit();
  }

  beginInitialMotion() {
    this.queue = [];
    this.mode = 'initial';
    this.dwellTarget = null;
    const spacing = this.config.initialSpacingMs;
    for (let i = 0; i < this.config.initialCount; i += 1) {
      this.queue.push({ at: this.clock + i * spacing, reason: 'initial', index: i + 1 });
    }
    this.log.add('capture', `Initial motion — ${this.config.initialCount} captures scheduled at ${spacing} ms spacing`, {
      count: this.config.initialCount,
      spacingMs: spacing,
    });
    this.emit();
  }

  requestTransition() {
    const ordered = [...this.candidates].sort((a, b) => a.distanceMm - b.distanceMm);
    this.transitionTargets = ordered;
    this.transitionIndex = 0;
    this.queue = [];
    this.mode = 'transition';
    this.windowStartedAt = this.clock;
    this.log.add('capture', 'Transition schedule started — nearest possible dwell target first', {
      targets: ordered.map((t) => t.label),
    });
    this.scheduleNextTransition();
    this.emit();
  }

  requestDwell(target) {
    // A dwell supersedes the ordinary transition schedule.
    this.queue = [];
    this.mode = 'dwell';
    this.dwellTarget = target || null;
    const n = this.config.dwellBurstCount;
    const gap = this.config.dwellBurstIntervalMs;
    for (let i = 0; i < n; i += 1) {
      this.queue.push({
        at: this.clock + i * gap,
        reason: 'dwell',
        index: i + 1,
        target: target || null,
      });
    }
    this.log.add('capture', `Dwell initiated — precision burst of ${n} captures at ${gap} ms supersedes the transition schedule`, {
      target: target ? target.label : 'selected target',
      count: n,
      intervalMs: gap,
    });
    this.emit();
  }

  scheduleNextTransition() {
    if (!this.transitionTargets.length) {
      this.mode = 'idle';
      return;
    }
    const target = this.transitionTargets[this.transitionIndex % this.transitionTargets.length];
    const travelMs = (target.distanceMm / this.config.saccadeSpeedMmPerSec) * 1000;
    const gap = Math.max(this.config.baseIntervalMs, travelMs);
    this.queue.push({
      at: this.clock + gap,
      reason: 'transition',
      target,
      gapMs: gap,
    });
    this.log.add('capture', `Next transition capture scheduled for ${target.label} in ${Math.round(gap)} ms`, {
      target: target.label,
      distanceMm: Math.round(target.distanceMm),
      gapMs: Math.round(gap),
    });
  }

  tick(realNow = performance.now()) {
    const dt = clamp(realNow - this.lastReal, 0, 250) * this.speed;
    this.lastReal = realNow;
    if (!this.running) {
      this.emit();
      return;
    }
    this.clock += dt;

    // One-minute transition window: each transition capture restarts it.
    if (
      this.mode === 'transition' &&
      this.windowStartedAt != null &&
      this.clock - this.windowStartedAt > this.config.transitionWindowMs
    ) {
      this.queue = [];
      this.mode = 'idle';
      this.log.add('capture', 'Transition window elapsed (one minute without a capture) — schedule idle', {
        windowMs: this.config.transitionWindowMs,
      });
    }

    while (this.queue.length && this.queue[0].at <= this.clock) {
      this.fire(this.queue.shift());
    }

    if (this.mode === 'dwell' && this.queue.length === 0) {
      this.log.add('capture', 'Precision burst complete — returning to the transition schedule', {
        target: this.dwellTarget ? this.dwellTarget.label : null,
      });
      if (this.transitionTargets.length && this.transitionIndex < this.transitionTargets.length) {
        this.mode = 'transition';
        this.windowStartedAt = this.clock;
        this.scheduleNextTransition();
      } else {
        this.mode = 'idle';
      }
    } else if (this.mode === 'initial' && this.queue.length === 0) {
      if (this.candidates.length) {
        this.requestTransition();
      } else {
        this.mode = 'idle';
      }
    } else if (this.mode === 'transition' && this.queue.length === 0) {
      this.transitionIndex += 1;
      if (this.transitionIndex < this.transitionTargets.length) {
        this.scheduleNextTransition();
      } else {
        this.mode = 'idle';
        this.log.add('capture', 'Transition sequence complete — observation requests stop', {
          captures: this.counts.transition,
        });
      }
    }

    this.emit();
  }

  fire(job) {
    this.lastCaptureAt = this.clock;
    this.lastCaptureReason = job.reason;
    this.counts[job.reason] = (this.counts[job.reason] || 0) + 1;
    if (job.reason === 'transition') this.windowStartedAt = this.clock;
    const capture = {
      at: this.clock,
      reason: job.reason,
      target: job.target ? job.target.label : null,
      index: job.index ?? null,
    };
    this.captures.push(capture);
    if (this.captures.length > 80) this.captures.shift();
    this.field.capture(job.reason);
    this.log.add('capture', `Capture #${this.captures.length + this.counts.initial + this.counts.transition + this.counts.dwell} — ${job.reason}${job.target ? ` (${job.target.label})` : ''}`, {
      reason: job.reason,
      target: job.target ? job.target.label : null,
      clockMs: Math.round(this.clock),
    });
  }

  windowRemainingMs() {
    if (this.windowStartedAt == null) return null;
    return Math.max(0, this.config.transitionWindowMs - (this.clock - this.windowStartedAt));
  }

  status() {
    return {
      mode: this.mode,
      running: this.running,
      speed: this.speed,
      clock: this.clock,
      total: Object.values(this.counts).reduce((a, b) => a + b, 0),
      counts: { ...this.counts },
      lastCaptureAt: this.lastCaptureAt,
      lastCaptureReason: this.lastCaptureReason,
      windowRemainingMs: this.windowRemainingMs(),
      dwellTarget: this.dwellTarget ? this.dwellTarget.label : null,
      observationAgeMs: this.field.lastCaptureAt ? performance.now() - this.field.lastCaptureAt : null,
    };
  }
}
