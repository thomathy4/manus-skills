// Inspectable event history for debugging and verification.

import { CATEGORIES } from '../core/events.js';
import { badge, btn, clear, h, panel, sectionGrid } from './dom.js';

export function mountLog(root, app) {
  const { log, calibration, field, engine, capture } = app;
  const list = h('ul', { class: 'log-list' });
  const filter = h(
    'select',
    { class: 'select' },
    h('option', { value: '' }, 'All categories'),
    ...CATEGORIES.map((c) => h('option', { value: c }, c)),
  );
  const countLine = h('p', { class: 'mono muted' }, '');

  function render() {
    const category = filter.value;
    const entries = log.filter(category).slice(-120).reverse();
    clear(list);
    if (!entries.length) {
      list.appendChild(h('li', { class: 'muted' }, 'No events in this category yet.'));
    }
    for (const entry of entries) {
      list.appendChild(
        h(
          'li',
          {},
          h('span', { class: 'mono muted' }, new Date(entry.at).toLocaleTimeString([], { hour12: false })),
          badge(entry.category, 'accent'),
          h('span', {}, entry.message),
        ),
      );
    }
    countLine.textContent = `${log.entries.length} events stored (last 120 shown)`;
  }

  filter.addEventListener('change', render);
  log.subscribe(render);

  const dump = h('pre', { class: 'dump', hidden: true }, '');
  const dumpBtn = btn('Show JSON', () => {
    dump.hidden = !dump.hidden;
    if (!dump.hidden) {
      dump.textContent = JSON.stringify(
        {
          calibration: calibration.toJSON(),
          field: field.summary(),
          capture: capture.status(),
          fingers: engine.snapshots(),
          clicks: engine.clicks(),
          events: log.entries.slice(-200),
        },
        null,
        2,
      );
    }
  });

  root.appendChild(
    sectionGrid(
      panel(
        'Event history',
        'Every subsystem writes here, including suppressed duplicate transitions.',
        h('div', { class: 'control' }, filter, dumpBtn),
        countLine,
        list,
        dump,
      ),
    ),
  );

  render();

  return {
    onShow: render,
    tick() {},
  };
}
