// Tiny DOM helpers shared by the prototype views.

export function append(el, children) {
  children.flat(5).forEach((child) => {
    if (child == null || child === false) return;
    el.appendChild(child instanceof Node ? child : document.createTextNode(String(child)));
  });
  return el;
}

export function h(tag, attrs = {}, ...children) {
  const el = document.createElement(tag);
  Object.entries(attrs || {}).forEach(([key, value]) => {
    if (value == null || value === false) return;
    if (key === 'class') el.className = value;
    else if (key === 'html') el.innerHTML = value;
    else if (key === 'dataset') Object.assign(el.dataset, value);
    else if (key === 'style') Object.assign(el.style, value);
    else if (key.startsWith('on') && typeof value === 'function') {
      el.addEventListener(key.slice(2).toLowerCase(), value);
    } else if (value === true) el.setAttribute(key, '');
    else el.setAttribute(key, String(value));
  });
  append(el, children);
  return el;
}

export function clear(el) {
  while (el.firstChild) el.removeChild(el.firstChild);
  return el;
}

export function panel(title, subtitle, ...children) {
  return h(
    'section',
    { class: 'panel' },
    h(
      'header',
      { class: 'panel-head' },
      h('h2', {}, title),
      subtitle ? h('p', {}, subtitle) : null,
    ),
    h('div', { class: 'panel-body' }, ...children),
  );
}

export function row(label, control, hint) {
  return h(
    'div',
    { class: 'row' },
    h('span', { class: 'row-label' }, label),
    h('span', { class: 'row-control' }, control),
    hint ? h('span', { class: 'row-hint' }, hint) : null,
  );
}

export function numInput({ value, min, max, step, onChange, id, width }) {
  const input = h('input', {
    type: 'number',
    value,
    min,
    max,
    step,
    id,
    class: 'num',
    style: width ? { width } : undefined,
  });
  input.addEventListener('input', () => onChange(Number(input.value)));
  return input;
}

export function badge(text, tone = 'neutral') {
  return h('span', { class: `badge badge-${tone}` }, text);
}

export function btn(label, onClick, { variant = 'default', id, title } = {}) {
  return h(
    'button',
    { class: `btn btn-${variant}`, id, title, type: 'button', onclick: onClick },
    label,
  );
}

export function stat(label, value, hint) {
  return h(
    'div',
    { class: 'stat' },
    h('span', { class: 'stat-label' }, label),
    h('span', { class: 'stat-value' }, value),
    hint ? h('span', { class: 'stat-hint' }, hint) : null,
  );
}

export function kv(label, value) {
  return h(
    'div',
    { class: 'kv' },
    h('span', { class: 'kv-label' }, label),
    h('span', { class: 'kv-value' }, value),
  );
}

export function bar(value, tone = 'accent') {
  const fill = h('span', { class: `bar-fill bar-${tone}` });
  const el = h('div', { class: 'bar' }, fill);
  el.setValue = (v) => {
    fill.style.width = `${Math.max(0, Math.min(1, v)) * 100}%`;
  };
  el.setValue(value);
  return el;
}

export function legendItem(color, text) {
  return h(
    'span',
    { class: 'legend-item' },
    h('span', { class: 'legend-dot', style: { background: color } }),
    text,
  );
}

export function sectionGrid(...children) {
  return h('div', { class: 'lab-grid' }, ...children);
}
