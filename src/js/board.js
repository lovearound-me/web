// The first screen on a wide window: everyone as tiles to click, the close
// ones big. On a phone it is home.js, the apps' popover; the two share the
// model, the strings and what a click does.

import { h, icon, closeContacts, otherContacts, contactsByName, colorFor, anyoneWait, peopleCount, firstLetter, contains, startDrag } from './lib.js';
import { tr } from './i18n.js';
import { settings, save } from './settings.js';
import { DOWNLOADS } from './config.js';
import { m, send, sendToAnyone, isPaused, pauseText, resume, moveCircle } from './model.js';
import { slot, avatar, banner, searchField, inviteRow, shareButton, linkRow } from './ui.js';
import { go } from './router.js';

/// Wide enough for tiles; narrower windows get the phone's screen.
export const WIDE = matchMedia('(min-width: 900px)');

export function boardScreen() {
  let query = '';
  const search = searchField((value) => {
    query = value;
    update();
  });
  const note = slot();
  const banners = slot('div', { class: 'col', style: { gap: '8px' } });
  const empty = slot();
  const close = closeTiles();
  const closeSection = h('section', { class: 'board-section' }, h('h2', null, tr('Рядом')), close.el);
  const othersHead = slot('h2');
  const others = slot('div', { class: 'board-grid small' });
  const othersSection = h('section', { class: 'board-section' }, othersHead, others);
  const footer = slot('div', { class: 'board-foot' });
  const problem = slot();

  const el = h('div', { class: 'page board' },
    note, banners,
    h('div', { class: 'board-head' }, h('h1', { class: 'question' }, tr('О ком ты сейчас думаешь?')), search.el),
    empty, closeSection, othersSection, footer, problem);

  function update() {
    // Receiving only while the tab is open: one quiet line, until closed.
    note.fill(!settings.webNoteSeen && h('div', { class: 'web-strip', role: 'note' },
      icon('laptop'),
      h('span', { class: 'grow' }, tr('В браузере сердечки приходят, только пока вкладка открыта. Приложение для компьютера ловит их всегда.')),
      h('a', { href: DOWNLOADS, target: '_blank', rel: 'noopener' }, tr('Скачать приложение')),
      h('button', { class: 'icon-button', 'aria-label': tr('Понятно'), title: tr('Понятно'), onclick: () => { settings.webNoteSeen = true; save(); update(); } }, icon('x'))));

    banners.fill(
      isPaused() && banner('moon', tr('{pause}. Сигналы не придут.', { pause: pauseText() }),
        h('button', { class: 'link strong', onclick: resume }, tr('Снять'))));

    const none = m.loaded && m.contacts.length === 0;
    empty.fill(none && h('div', { class: 'col center board-empty' },
      h('div', { class: 'strong', style: { fontSize: '17px' } }, tr('Пока никого нет')),
      h('div', { class: 'muted' }, tr('Добавь людей по их ссылке или отправь им свой Love ID, чтобы они могли поддерживать тебя.')),
      h('div', { class: 'row', style: { gap: '8px', justifyContent: 'center', flexWrap: 'wrap' } },
        shareButton(), linkRow('plusCircle', tr('Добавить по ссылке'), () => go('#/add')))));

    search.el.hidden = m.contacts.length === 0;
    search.setPlaceholder(tr('Найти — {people}', { people: peopleCount(m.contacts.length) }));

    const q = query.trim();
    // While searching, everyone found is in one list; the big tiles wait.
    closeSection.hidden = !!q || none;
    if (!q) close.update();
    const list = q ? contactsByName(m).filter((c) => contains(c.label, q)) : otherContacts(m);
    othersSection.hidden = none;
    othersHead.fill(q ? null : tr('Остальные'));
    others.fill(
      list.map(smallTile),
      q && list.length === 0 && h('div', { class: 'muted', style: { padding: '18px 4px' } }, tr('Никого с таким именем')),
      !q && h('button', { class: 'tile add', onclick: () => go('#/add') }, icon('plus', 20), h('span', null, tr('Добавить по ссылке'))));

    footer.fill(m.contacts.length > 0 && inviteRow());
    problem.fill(m.problem && h('div', { class: 'small danger', role: 'alert' }, m.problem));
  }

  update();
  return { el, update };
}

/// Someone in "Остальные" (or found by the search): a click sends.
function smallTile(contact) {
  const color = colorFor(m, contact);
  const sent = m.sent === contact.id;
  return h('button', {
    class: 'tile small' + (sent ? ' sent' : ''),
    style: { '--ring': color.ring, '--tint': color.tint, '--deep': color.deep },
    title: contact.label,
    onclick: () => send(contact),
  },
  avatar(contact.label, color, 36),
  h('span', { class: 'name grow ellipsis' }, contact.label),
  sent && h('span', { class: 'sent-mark' }, tr('Улетело ♥')));
}

/// "Рядом": "Кому-нибудь на свете", then the close ones in their order. The
/// tiles are kept between renders and ordered with CSS, so a drag never
/// loses the tile under the pointer.
function closeTiles() {
  let dragging = null;
  const tiles = new Map();
  const el = h('div', { class: 'board-grid big' });

  const anyone = h('button', { class: 'tile big anyone', onclick: () => sendToAnyone() });
  el.append(anyone);

  function tile(contact) {
    const node = h('button', { class: 'tile big', dataset: { circle: contact.id } });
    node.addEventListener('click', () => {
      const c = m.contacts.find((x) => x.id === node.dataset.circle);
      if (c) send(c);
    });
    node.addEventListener('contextmenu', (e) => e.preventDefault());
    node.addEventListener('pointerdown', (event) => startDrag(event, {
      onStart: () => {
        dragging = node.dataset.circle;
        update();
      },
      onMove: (e) => {
        const over = document.elementFromPoint(e.clientX, e.clientY)?.closest('[data-circle]')?.dataset.circle;
        if (over && over !== dragging) moveCircle(dragging, over);
      },
      onEnd: () => {
        dragging = null;
        update();
      },
    }));
    el.append(node);
    return node;
  }

  function update() {
    const now = Date.now();
    const close = closeContacts(m);
    const seen = new Set();
    close.forEach((contact, index) => {
      seen.add(contact.id);
      const node = tiles.get(contact.id) ?? tile(contact);
      tiles.set(contact.id, node);
      const color = colorFor(m, contact);
      const sent = m.sent === contact.id;
      node.className = 'tile big' + (sent ? ' sent' : '') + (dragging === contact.id ? ' dragging' : '');
      node.style.order = index + 1;
      node.style.setProperty('--ring', color.ring);
      node.style.setProperty('--tint', color.tint);
      node.style.setProperty('--deep', color.deep);
      node.title = contact.label;
      node.setAttribute('aria-label', contact.label);
      node.replaceChildren(
        h('span', { class: 'tile-avatar' }, sent ? '♥' : firstLetter(contact.label)),
        h('span', { class: 'tile-name ellipsis' }, contact.label),
        h('span', { class: 'tile-hint' }, sent ? tr('Улетело ♥') : ''));
    });
    for (const [id, node] of tiles) {
      if (!seen.has(id)) {
        node.remove();
        tiles.delete(id);
      }
    }

    // One signal an hour to a random person online; the ring fills back up.
    const wait = anyoneWait(now);
    const justSent = settings.anyoneSentAt != null && now - settings.anyoneSentAt < 120_000;
    const help = wait != null
      ? tr('Кому-нибудь на свете: снова через {n} мин', { n: wait })
      : tr('Кому-нибудь на свете: сигнал уйдёт случайному человеку, раз в час. Он не узнает, от кого.');
    anyone.title = help;
    anyone.setAttribute('aria-label', help);
    anyone.classList.toggle('sent', justSent);
    anyone.classList.toggle('waiting', wait != null);
    anyone.style.opacity = m.anyoneSending ? 0.6 : 1;
    const r = 23.5;
    const length = 2 * Math.PI * r;
    const progress = wait != null ? (60 - wait) / 60 : 0;
    const ring = h('svg', { class: 'ring', viewBox: '0 0 50 50', 'aria-hidden': 'true' },
      h('circle', { cx: '25', cy: '25', r: String(r), fill: 'none', stroke: 'var(--star)', 'stroke-width': '2.2', opacity: wait == null ? '1' : '0.25' }),
      wait != null && h('circle', { cx: '25', cy: '25', r: String(r), fill: 'none', stroke: 'var(--star)', 'stroke-width': '2.2', 'stroke-linecap': 'round', 'stroke-dasharray': `${length * progress} ${length}` }));
    anyone.replaceChildren(
      h('span', { class: 'tile-avatar' }, ring, icon('sparkles', 30)),
      h('span', { class: 'tile-name ellipsis' }, tr('Кому-нибудь на свете')),
      h('span', { class: 'tile-hint' }, justSent ? tr('Улетело кому-то ♥') : wait != null ? tr('Кому-нибудь — через {n} мин', { n: wait }) : ''));
  }

  return { el, update };
}
