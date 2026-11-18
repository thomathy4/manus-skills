// Inspectable event history. Every subsystem writes here so the interaction
// model can be audited after the fact, including suppressed events.

export const CATEGORIES = [
  'system',
  'calibration',
  'geometry',
  'capture',
  'finger',
  'switch',
  'gesture',
  'map',
];

export class EventLog {
  constructor(limit = 800) {
    this.limit = limit;
    this.entries = [];
    this.seq = 0;
    this.listeners = new Set();
  }

  add(category, message, data = {}) {
    this.seq += 1;
    const entry = {
      id: this.seq,
      at: Date.now(),
      category,
      message,
      data,
    };
    this.entries.push(entry);
    if (this.entries.length > this.limit) {
      this.entries.splice(0, this.entries.length - this.limit);
    }
    this.listeners.forEach((fn) => {
      try {
        fn(entry, this.entries);
      } catch (err) {
        // A broken view must never break the interaction engine.
        console.error(err);
      }
    });
    return entry;
  }

  subscribe(fn) {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  clear() {
    this.entries = [];
    this.listeners.forEach((fn) => fn(null, this.entries));
  }

  filter(category) {
    return category
      ? this.entries.filter((e) => e.category === category)
      : this.entries.slice();
  }

  count(predicate) {
    return this.entries.reduce((n, e) => (predicate(e) ? n + 1 : n), 0);
  }

  some(predicate) {
    return this.entries.some(predicate);
  }
}
