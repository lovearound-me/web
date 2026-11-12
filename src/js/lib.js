// Small pieces every screen is built from: making elements, icons, the
// palette, the derived lists. Ported from the Windows app's ui/lib.js.

import { tr, trn, LANG } from './i18n.js';
import { settings } from './settings.js';

// ---- elements --------------------------------------------------------------------

const SVG = 'http://www.w3.org/2000/svg';

/// h('button', { class: 'pill', onclick: … }, 'text', child, [more])
export function h(tag, props, ...children) {
  const el = tag === 'svg' || tag === 'circle' || tag === 'path' ? document.createElementNS(SVG, tag) : document.createElement(tag);
  for (const [key, value] of Object.entries(props || {})) {
    if (value == null || value === false) continue;
    if (key === 'style' && typeof value === 'object') {
      for (const [name, v] of Object.entries(value)) {
        if (v != null) name.startsWith('--') ? el.style.setProperty(name, v) : (el.style[name] = v);
      }
    } else if (key.startsWith('on') && typeof value === 'function') {
      el.addEventListener(key.slice(2), value);
    } else if (key === 'dataset') {
      Object.assign(el.dataset, value);
    } else if (key === 'value' || key === 'checked' || key === 'disabled' || key === 'textContent') {
      el[key] = value;
    } else {
      el.setAttribute(key === 'className' ? 'class' : key, value === true ? '' : value);
    }
  }
  append(el, children);
  return el;
}

function append(el, children) {
  for (const child of children) {
    if (child == null || child === false || child === true) continue;
    if (Array.isArray(child)) append(el, child);
    else el.append(child instanceof Node ? child : String(child));
  }
}

// ---- icons -----------------------------------------------------------------------

const ICONS = {
  book: '<path d="M4 19.5v-15A2.5 2.5 0 0 1 6.5 2H20v20H6.5a2.5 2.5 0 0 1 0-5H20"/>',
  gear: '<path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z"/><circle cx="12" cy="12" r="3"/>',
  wifiOff: '<path d="M12 20h.01"/><path d="M8.5 16.43a5 5 0 0 1 7 0"/><path d="M5 12.86a10 10 0 0 1 5.17-2.69"/><path d="M19 12.86a10 10 0 0 0-2-1.52"/><path d="M2 8.82a15 15 0 0 1 4.18-2.64"/><path d="M22 8.82a15 15 0 0 0-11.29-3.76"/><path d="m2 2 20 20"/>',
  search: '<circle cx="11" cy="11" r="7.5"/><path d="m20.5 20.5-4.2-4.2"/>',
  plus: '<path d="M5 12h14"/><path d="M12 5v14"/>',
  plusCircle: '<circle cx="12" cy="12" r="10"/><path d="M8 12h8"/><path d="M12 8v8"/>',
  check: '<path d="M20 6 9 17l-5-5"/>',
  alert: '<circle cx="12" cy="12" r="10"/><path d="M12 7.5v5.5"/><path d="M12 16.5h.01"/>',
  copy: '<rect x="8" y="8" width="14" height="14" rx="2"/><path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2"/>',
  chevronLeft: '<path d="m15 18-6-6 6-6"/>',
  trash: '<path d="M3 6h18"/><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"/><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2"/>',
  globe: '<circle cx="12" cy="12" r="10"/><path d="M12 2a14.5 14.5 0 0 0 0 20 14.5 14.5 0 0 0 0-20"/><path d="M2 12h20"/>',
  share: '<path d="M12 3v12"/><path d="m8 7 4-4 4 4"/><path d="M5 12v7a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-7"/>',
  laptop: '<rect x="4" y="4" width="16" height="11" rx="1.5"/><path d="M2 19h20"/>',
  x: '<path d="M18 6 6 18"/><path d="m6 6 12 12"/>',
  sparkles: '<path d="M9.94 15.5A2 2 0 0 0 8.5 14.06l-6.14-1.58a.5.5 0 0 1 0-.96L8.5 9.94A2 2 0 0 0 9.94 8.5l1.58-6.14a.5.5 0 0 1 .96 0l1.58 6.14a2 2 0 0 0 1.44 1.44l6.14 1.58a.5.5 0 0 1 0 .96l-6.14 1.58a2 2 0 0 0-1.44 1.44l-1.58 6.14a.5.5 0 0 1-.96 0z"/><path d="M20 3v4"/><path d="M22 5h-4"/><path d="M4 17v2"/><path d="M5 18H3"/>',
  xCircle: { d: '<path d="M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20Zm3.7 12.3-1.4 1.4L12 13.4l-2.3 2.3-1.4-1.4 2.3-2.3-2.3-2.3 1.4-1.4 2.3 2.3 2.3-2.3 1.4 1.4-2.3 2.3Z"/>' },
  heart: { d: '<path d="M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4.05 3 5.5l7 7Z"/>' },
  moon: { d: '<path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z"/>' },
  play: { d: '<path d="M7 4v16l13-8Z"/>' },
};

export function icon(name, size) {
  const def = ICONS[name];
  const filled = typeof def === 'object';
  const svg = document.createElementNS(SVG, 'svg');
  svg.setAttribute('class', 'icon' + (filled ? ' filled' : ''));
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('aria-hidden', 'true');
  if (size) svg.style.width = svg.style.height = size + 'px';
  svg.innerHTML = filled ? def.d : def; // our own constants above, never user text
  return svg;
}

// ---- palette ---------------------------------------------------------------------

/// The twelve warm colors: `color` for rings and the glow, `tint` for row
/// backgrounds, `deep` for text on the tint. Indices are what settings store.
const PALETTE = [
  ['Коралловый', 0xF07A62, 0xFDE6E0, 0xA8402B],
  ['Розовый', 0xE86A9A, 0xFBE2EC, 0xA3305E],
  ['Голубой', 0x4E9BD8, 0xE0EEF9, 0x22679E],
  ['Шалфей', 0x6FAE7C, 0xE3F1E6, 0x39744A],
  ['Лавандовый', 0x9B83DD, 0xECE6FA, 0x5E45A3],
  ['Медовый', 0xE5A93B, 0xFBF0DA, 0x8A5E0E],
  ['Бирюзовый', 0x3FB3A8, 0xDDF3F0, 0x1D6F68],
  ['Вишнёвый', 0xC94A5E, 0xF8E1E5, 0x8E2638],
  ['Карамельный', 0xC98B5E, 0xF6E9DE, 0x7D4F2C],
  ['Оливковый', 0x9DA24A, 0xEEF0DC, 0x5C601F],
  ['Индиго', 0x6474D6, 0xE4E7F8, 0x3640A0],
  ['Грифельный', 0x7E8C99, 0xE8ECEF, 0x46525E],
];
// The names, written out for build.py, which collects the texts passed to tr().
const NAMES = () => [tr('Коралловый'), tr('Розовый'), tr('Голубой'), tr('Шалфей'), tr('Лавандовый'), tr('Медовый'),
  tr('Бирюзовый'), tr('Вишнёвый'), tr('Карамельный'), tr('Оливковый'), tr('Индиго'), tr('Грифельный')];
export const PALETTE_SIZE = PALETTE.length;
export const STAR_COLOR = '#F2C46B';

const hex = (c) => '#' + c.toString(16).padStart(6, '0');

function mix(a, b, t) {
  let result = 0;
  for (const shift of [16, 8, 0]) {
    const x = (a >> shift) & 0xff;
    const y = (b >> shift) & 0xff;
    result |= Math.round(x + (y - x) * t) << shift;
  }
  return result;
}

export const darkQuery = matchMedia('(prefers-color-scheme: dark)');

/// The pastel tint on light paper, a dim wash of the color on dark.
export function palette(index) {
  const i = ((index % PALETTE.length) + PALETTE.length) % PALETTE.length;
  const [, color, tint, deep] = PALETTE[i];
  const dark = darkQuery.matches;
  return {
    name: NAMES()[i],
    ring: hex(color),
    tint: hex(dark ? mix(color, 0x2a211d, 0.3) : tint),
    deep: hex(dark ? mix(color, 0xffffff, 0.45) : deep),
  };
}

// ---- the model's derived lists -------------------------------------------------

const byName = (a, b) => a.label.localeCompare(b.label, LANG, { numeric: true, sensitivity: 'base' });

/// Circles on top, in the order set by hand.
export const closeContacts = (m) => m.contacts.filter((c) => c.close);

/// Everyone else, the most recently signalled first, then by name.
export function otherContacts(m) {
  const last = settings.lastSent;
  return m.contacts.filter((c) => !c.close).sort((a, b) => (last[b.id] ?? 0) - (last[a.id] ?? 0) || byName(a, b));
}

export const contactsByName = (m) => [...m.contacts].sort(byName);

export function colorIndex(m, contact) {
  return settings.contactColors[contact.id] ?? Math.max(0, m.contacts.findIndex((c) => c.id === contact.id));
}

export const colorFor = (m, contact) => palette(colorIndex(m, contact));

/// The first color not yet used, for a new contact.
export function nextColor(m) {
  const used = new Set(m.contacts.map((c) => settings.contactColors[c.id] ?? -1));
  for (let i = 0; i < PALETTE.length; i++) if (!used.has(i)) return i;
  return m.contacts.length % PALETTE.length;
}

/// New contacts start among the close ones until there are a couple of rows of them.
export const newContactIsClose = (m) => closeContacts(m).length < 10;

/// Whole minutes until the next signal to anyone, or null if it can go now.
export function anyoneWait(now = Date.now()) {
  if (settings.anyoneSentAt == null) return null;
  const left = settings.anyoneSentAt + 3600_000 - now;
  return left > 0 ? Math.ceil(left / 60_000) : null;
}

export const peopleCount = (n) => trn('{n} человек', n);

export const firstLetter = (label) => (Array.from(label.trim())[0] ?? '♥').toUpperCase();

export const contains = (label, query) => label.toLocaleLowerCase(LANG).includes(query.toLocaleLowerCase(LANG));

/// The code from an invite link (or the bare code), as typed: 10 characters
/// of the server's alphabet, dashes anywhere. The server never says whether a
/// code is taken, so this is the only check a typo gets.
export function inviteId(text) {
  let rest = String(text || '').trim();
  for (const marker of ['/i/', 'lovearound://add/', 'needed://add/']) {
    const at = rest.lastIndexOf(marker);
    if (at >= 0) rest = rest.slice(at + marker.length);
  }
  rest = rest.split(/[/?#]/)[0];
  const code = rest.toUpperCase().replaceAll('-', '');
  return code.length === 10 && /^[23456789ABCDEFGHJKMNPQRSTVWXYZ]+$/.test(code) ? rest : null;
}

/// Copies text; true if it worked.
export async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    const area = h('textarea', { style: { position: 'fixed', opacity: '0', top: '0' } });
    area.value = text;
    document.body.append(area);
    area.select();
    let ok = false;
    try {
      ok = document.execCommand('copy');
    } catch {
      ok = false;
    }
    area.remove();
    return ok;
  }
}

// ---- dragging ------------------------------------------------------------------

/// A pointer drag that tells a drag from a click: with a mouse, past 4 px it
/// is a drag; with a finger, after holding still for a moment (so the page
/// still scrolls). The click that ends a drag is swallowed.
export function startDrag(event, { onStart, onMove, onEnd }) {
  if (event.button !== 0) return;
  const target = event.currentTarget;
  const touch = event.pointerType !== 'mouse';
  const [x0, y0] = [event.clientX, event.clientY];
  let dragging = false;
  let held = !touch;
  let gone = false;
  const hold = touch ? setTimeout(() => { held = true; begin(event); }, 380) : null;

  const begin = (e) => {
    if (dragging || gone) return;
    dragging = true;
    try {
      target.setPointerCapture(e.pointerId);
    } catch {
      // The pointer is already gone.
    }
    navigator.vibrate?.(8);
    onStart?.(e);
  };
  // While dragging with a finger the page must not scroll.
  const noScroll = (e) => dragging && e.cancelable && e.preventDefault();
  const move = (e) => {
    if (!held) {
      // Moved before the hold: it's a scroll or a swipe.
      if (Math.hypot(e.clientX - x0, e.clientY - y0) > 8) finish(e, false);
      return;
    }
    if (!dragging && Math.hypot(e.clientX - x0, e.clientY - y0) > 4) begin(e);
    if (dragging) onMove?.(e);
  };
  const finish = (e, drop) => {
    gone = true;
    clearTimeout(hold);
    target.removeEventListener('pointermove', move);
    target.removeEventListener('pointerup', up);
    target.removeEventListener('pointercancel', cancel);
    target.removeEventListener('touchmove', noScroll);
    if (dragging) {
      dragging = false;
      onEnd?.(e, drop);
      const swallow = (c) => { c.stopPropagation(); c.preventDefault(); };
      window.addEventListener('click', swallow, { capture: true, once: true });
      setTimeout(() => window.removeEventListener('click', swallow, { capture: true }), 0);
    }
  };
  const up = (e) => finish(e, true);
  const cancel = (e) => finish(e, false);
  target.addEventListener('pointermove', move);
  target.addEventListener('pointerup', up);
  target.addEventListener('pointercancel', cancel);
  target.addEventListener('touchmove', noScroll, { passive: false });
}
