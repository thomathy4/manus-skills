// Section 3 — one common virtual-finger engine.
//
// Every input source (each eye, physical touch, a fixed switch) drives the same
// operations and the same state machine. Provenance and measurement history are
// kept on the finger, and duplicate or impossible transitions are suppressed
// and logged rather than silently dropped.

export const FINGER_OPERATIONS = [
  'contact',
  'move',
  'pause',
  'resume',
  'release',
  'click',
  'hold',
  'context',
];

const ALLOWED = {
  contact: ['idle'],
  move: ['contact', 'moving'],
  pause: ['contact', 'moving', 'holding'],
  resume: ['paused'],
  release: ['contact', 'moving', 'paused', 'holding'],
  click: ['idle', 'contact'],
  hold: ['contact', 'moving'],
  context: ['contact', 'holding'],
};

const STATE_AFTER = {
  contact: 'contact',
  move: 'moving',
  pause: 'paused',
  resume: 'moving',
  release: 'idle',
  click: 'idle',
  hold: 'holding',
  context: 'holding',
};

export class VirtualFinger {
  constructor({ id, label, source }) {
    this.id = id;
    this.label = label;
    this.source = source;
    this.originalSource = source;
    this.position = null;
    this.contact = false;
    this.state = 'idle';
    this.gestureState = 'none';
    this.target = null;
    this.confidence = 0;
    this.provenance = [];
    this.history = [];
    this.contactSince = null;
    this.contactOrigin = null;
    this.maxTravel = 0;
    this.lastEventAt = 0;
  }

  snapshot() {
    return {
      id: this.id,
      label: this.label,
      source: this.source,
      state: this.state,
      contact: this.contact,
      position: this.position ? { x: Math.round(this.position.x), y: Math.round(this.position.y) } : null,
      confidence: this.confidence,
      gestureState: this.gestureState,
      historyLength: this.history.length,
    };
  }
}

export class FingerEngine {
  constructor(log, options = {}) {
    this.log = log;
    this.fingers = new Map();
    this.listeners = new Set();
    this.events = [];
    this.seq = 0;
    this.config = { clickMs: 420, clickTolerancePx: 16 };
    Object.assign(this.config, options);
  }

  register(def) {
    const finger = new VirtualFinger(def);
    this.fingers.set(finger.id, finger);
    this.log.add('finger', `Virtual finger registered: ${finger.label}`, {
      fingerId: finger.id,
      source: finger.source,
    });
    this.emit({ type: 'registered', fingerId: finger.id });
    return finger;
  }

  get(id) {
    return this.fingers.get(id);
  }

  onChange(fn) {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  emit(event) {
    this.listeners.forEach((fn) => {
      try {
        fn(event, this);
      } catch (err) {
        console.error(err);
      }
    });
  }

  push(finger, type, payload, extra = {}) {
    const entry = {
      t: payload.t ?? performance.now(),
      type,
      x: payload.x ?? finger.position?.x ?? null,
      y: payload.y ?? finger.position?.y ?? null,
      state: finger.state,
      source: payload.source ?? finger.source,
      ...extra,
    };
    finger.history.push(entry);
    if (finger.history.length > 240) finger.history.shift();
    finger.lastEventAt = entry.t;
  }

  dispatch(fingerId, type, payload = {}) {
    const finger = this.fingers.get(fingerId);
    if (!finger) return { ok: false, reason: 'unknown finger' };
    if (!FINGER_OPERATIONS.includes(type)) return { ok: false, reason: 'unknown operation' };

    const allowed = ALLOWED[type] || [];
    if (!allowed.includes(finger.state)) {
      const reason = `${type} is not valid from state "${finger.state}"`;
      this.log.add('finger', `Suppressed ${type} on ${finger.label} — ${reason}`, {
        fingerId,
        type,
        state: finger.state,
        suppressed: true,
      });
      this.push(finger, 'suppressed', payload, { suppressedType: type, reason });
      this.emit({ type: 'suppressed', fingerId, suppressedType: type, reason, finger: finger.snapshot() });
      return { ok: false, reason };
    }

    const t = payload.t ?? performance.now();
    const x = Number.isFinite(payload.x) ? payload.x : finger.position?.x ?? 0;
    const y = Number.isFinite(payload.y) ? payload.y : finger.position?.y ?? 0;

    if (type === 'contact') {
      finger.contact = true;
      finger.position = { x, y };
      finger.contactSince = t;
      finger.contactOrigin = { x, y };
      finger.maxTravel = 0;
      finger.target = payload.target ?? null;
      finger.confidence = payload.confidence ?? finger.confidence;
      finger.provenance = payload.provenance ? [...payload.provenance] : finger.provenance;
    } else if (type === 'move') {
      if (finger.contactOrigin) {
        finger.maxTravel = Math.max(
          finger.maxTravel,
          Math.hypot(x - finger.contactOrigin.x, y - finger.contactOrigin.y),
        );
      }
      finger.position = { x, y };
      finger.confidence = payload.confidence ?? finger.confidence;
    } else if (type === 'click') {
      finger.position = { x, y };
      finger.contact = false;
      finger.confidence = payload.confidence ?? finger.confidence;
      if (payload.provenance) finger.provenance = [...payload.provenance];
    } else if (type === 'release') {
      finger.contact = false;
    } else if (type === 'pause') {
      finger.contact = true;
    } else if (type === 'resume') {
      finger.contact = true;
    }

    finger.state = STATE_AFTER[type];
    this.push(finger, type, { ...payload, x, y, t });
    this.seq += 1;
    const event = {
      id: this.seq,
      type,
      fingerId,
      source: payload.source ?? finger.source,
      x,
      y,
      t,
      state: finger.state,
      confidence: finger.confidence,
      provenance: finger.provenance,
      payload,
      finger: finger.snapshot(),
    };
    this.events.push(event);
    if (this.events.length > 240) this.events.shift();
    this.log.add('finger', `${finger.label} — ${type}`, {
      fingerId,
      type,
      state: finger.state,
      x: Math.round(x),
      y: Math.round(y),
      source: event.source,
      confidence: finger.confidence,
      provenance: finger.provenance,
    });
    this.emit(event);

    // A short touch/switch contact is a click; a drag is not.
    const autoClickable = finger.source === 'touch' || finger.source.startsWith('switch');
    if (
      type === 'release' &&
      autoClickable &&
      !payload.suppressClick &&
      finger.contactSince != null &&
      t - finger.contactSince <= this.config.clickMs &&
      finger.maxTravel <= this.config.clickTolerancePx
    ) {
      this.dispatch(fingerId, 'click', {
        x: finger.position?.x ?? x,
        y: finger.position?.y ?? y,
        t,
        confidence: finger.confidence,
        target: finger.target,
        provenance: [...finger.provenance, 'tap'],
      });
    }

    return { ok: true, event };
  }

  // Hand an in-progress interaction from one source to another without a second
  // contact and without losing the movement history.
  handover(fingerId, source, position = null) {
    const finger = this.fingers.get(fingerId);
    if (!finger) return { ok: false, reason: 'unknown finger' };
    if (finger.state === 'idle') {
      return this.dispatch(fingerId, 'contact', {
        x: position?.x ?? 0,
        y: position?.y ?? 0,
        source,
        confidence: position?.confidence ?? 0.8,
      });
    }
    const from = finger.source;
    if (position) finger.position = { x: position.x, y: position.y };
    finger.source = source;
    finger.confidence = position?.confidence ?? finger.confidence;
    this.push(finger, 'source-switch', { ...position, source }, { from, to: source });
    this.log.add('finger', `Interaction handed over ${from} → ${source} without a new contact`, {
      fingerId,
      from,
      to: source,
      state: finger.state,
      x: Math.round(finger.position?.x ?? 0),
      y: Math.round(finger.position?.y ?? 0),
    });
    this.emit({ type: 'source-switch', fingerId, from, to: source, finger: finger.snapshot() });
    return { ok: true, handover: true, from, to: source };
  }

  // Move an in-progress interaction to another input source's finger: the
  // contact continues, no second down/up is emitted, and the history travels.
  handoverInteraction(fromId, toId) {
    const from = this.fingers.get(fromId);
    const to = this.fingers.get(toId);
    if (!from || !to) return { ok: false, reason: 'unknown finger' };
    if (from.state === 'idle') return { ok: false, reason: 'no active interaction to hand over' };
    if (to.state !== 'idle') return { ok: false, reason: 'target finger already in contact' };

    to.contact = true;
    to.state = from.state === 'paused' ? 'paused' : 'moving';
    to.position = from.position ? { ...from.position } : null;
    to.contactOrigin = from.contactOrigin ? { ...from.contactOrigin } : null;
    to.contactSince = from.contactSince;
    to.maxTravel = from.maxTravel;
    to.confidence = from.confidence;
    to.provenance = [...from.provenance, `handover-from:${fromId}`];
    to.history.push({
      t: performance.now(),
      type: 'handover-in',
      x: to.position?.x ?? null,
      y: to.position?.y ?? null,
      state: to.state,
      source: to.source,
      from: fromId,
    });

    const previousState = from.state;
    from.state = 'idle';
    from.contact = false;
    from.gestureState = 'none';
    from.history.push({
      t: performance.now(),
      type: 'handover-out',
      x: from.position?.x ?? null,
      y: from.position?.y ?? null,
      state: 'idle',
      source: from.source,
      to: toId,
    });

    this.log.add(
      'finger',
      `Interaction handed over from ${from.label} to ${to.label} without a duplicate contact or click`,
      { from: fromId, to: toId, state: previousState },
    );
    this.emit({ type: 'handover', from: fromId, to: toId, finger: to.snapshot() });
    return { ok: true, from: fromId, to: toId };
  }

  resetAll() {
    for (const finger of this.fingers.values()) {
      finger.state = 'idle';
      finger.contact = false;
      finger.position = null;
      finger.source = finger.originalSource;
      finger.gestureState = 'none';
      finger.history = [];
      finger.contactSince = null;
      finger.contactOrigin = null;
      finger.maxTravel = 0;
    }
    this.log.add('finger', 'All virtual fingers reset');
    this.emit({ type: 'reset' });
  }

  setGestureState(fingerId, gestureState) {
    const finger = this.fingers.get(fingerId);
    if (finger) finger.gestureState = gestureState;
  }

  snapshots() {
    return [...this.fingers.values()].map((f) => f.snapshot());
  }

  clicks() {
    return this.events.filter((e) => e.type === 'click');
  }
}
