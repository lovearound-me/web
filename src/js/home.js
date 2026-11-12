// The first screen: who you are thinking of, in one tap. Ported from the
// Windows app's popover.

import { h, icon, closeContacts, otherContacts, contactsByName, colorFor, anyoneWait, peopleCount, firstLetter, contains, startDrag } from './lib.js';
import { tr } from './i18n.js';
import { settings, save } from './settings.js';
import { DOWNLOADS } from './config.js';
import { m, send, sendToAnyone, isPaused, pauseText, resume, moveCircle } from './model.js';
import { slot, avatar, caption, banner, linkRow, searchField, inviteRow, shareButton } from './ui.js';
import { go } from './router.js';

const ANYONE = '★anyone';

export function homeScreen() {
  let query = '';
  const search = searchField((value) => {
    query = value;
    list.fill(listView());
  });
  const circles = circlesView();
  const webNote = slot();
  const banners = slot('div', { class: 'col', style: { gap: '8px' } });
  const empty = slot();
  const searchBox = h('div', null, search.el);
  const list = slot();
  const footer = slot('div', { class: 'col', style: { gap: '8px' } });
  const problem = slot();

  const el = h('div', { class: 'page home col', style: { gap: '10px' } },
    h('h1', { class: 'question' }, tr('О ком ты сейчас думаешь?')),
    webNote, banners, circles.el, empty, searchBox, list, footer, problem);

  function listView() {
    const q = query.trim();
    if (q) {
      const found = contactsByName(m).filter((c) => contains(c.label, q));
      return h('div', { class: 'col', style: { gap: '2px' } },
        found.map(contactRow),
        found.length === 0 && h('div', { class: 'muted center', style: { padding: '14px 0' } }, tr('Никого с таким именем')));
    }
    const others = otherContacts(m);
    if (others.length === 0) return null;
    // A short book fits whole; a long one shows the recent few.
    const shown = others.length <= 8 ? others : others.slice(0, 7);
    return h('div', { class: 'col', style: { gap: '2px' } },
      h('div', { style: { padding: '0 10px 2px' } }, caption(shown.length < others.length ? tr('Недавние') : tr('Остальные'))),
      shown.map(contactRow),
      shown.length < others.length && h('div', { style: { padding: '0 6px' } },
        linkRow('book', tr('Вся книга · {n}', { n: m.contacts.length }), () => go('#/book'))));
  }

  function update() {
    // Receiving only while the tab is open: said once, gently, until closed.
    webNote.fill(!settings.webNoteSeen && h('div', { class: 'web-note' },
      h('div', { class: 'row', style: { gap: '10px', alignItems: 'flex-start' } },
        h('span', { class: 'badge' }, icon('laptop')),
        h('span', { class: 'grow' }, tr('Отсюда удобно отправлять сердечки. А получать — только пока эта вкладка открыта. Чтобы не пропустить ни одного, поставь приложение для компьютера: оно тихо ждёт в трее или строке меню.'))),
      h('div', { class: 'row', style: { gap: '8px', justifyContent: 'flex-end' } },
        h('button', { class: 'pill', onclick: () => { settings.webNoteSeen = true; save(); update(); } }, tr('Понятно')),
        h('a', { class: 'pill strong', href: DOWNLOADS, target: '_blank', rel: 'noopener' }, tr('Скачать приложение')))));

    banners.fill(
      isPaused() && banner('moon', tr('{pause}. Сигналы не придут.', { pause: pauseText() }),
        h('button', { class: 'link strong', onclick: resume }, tr('Снять'))));

    circles.update();
    const none = m.loaded && m.contacts.length === 0;
    empty.fill(none && [
      h('div', { class: 'col center', style: { gap: '6px', padding: '4px 0 6px' } },
        h('div', { class: 'strong', style: { fontSize: '15px' } }, tr('Пока никого нет')),
        h('div', { class: 'muted' }, tr('Добавь людей по их ссылке или отправь им свой Love ID, чтобы они могли поддерживать тебя.'))),
      shareButton(),
      linkRow('plusCircle', tr('Добавить по ссылке'), () => go('#/add')),
    ]);
    searchBox.hidden = m.contacts.length === 0;
    search.setPlaceholder(tr('Найти — {people}', { people: peopleCount(m.contacts.length) }));
    list.fill(listView());
    footer.fill(m.contacts.length > 0 && [h('hr'), inviteRow()]);
    problem.fill(m.problem && h('div', { class: 'small danger', role: 'alert' }, m.problem));
  }

  update();
  return { el, update };
}

/// A person in the book: a row with a name, a tap sends.
function contactRow(contact) {
  const color = colorFor(m, contact);
  const sent = m.sent === contact.id;
  return h('button', { class: 'contact-row' + (sent ? ' sent' : ''), style: { '--tint': color.tint }, onclick: () => send(contact) },
    avatar(contact.label, color, 32),
    h('span', { class: 'name grow ellipsis' }, contact.label),
    sent && h('span', { class: 'sent-mark', style: { color: color.deep } }, tr('Улетело ♥')));
}

// ---- circles ---------------------------------------------------------------------

/// The close people: circles without names, after the one for anyone in the
/// world. The name shows under them on hover (and after a tap); a drag puts a
/// circle elsewhere. Circles are kept between renders and ordered with CSS,
/// so a drag never loses the circle under the finger.
function circlesView() {
  let hovered = null;
  let dragging = null;
  const buttons = new Map();
  const grid = h('div', { class: 'circles' });
  const captionLine = slot('div', { class: 'circles-caption ellipsis', 'aria-live': 'polite' });
  const el = h('div', { class: 'col', style: { gap: '6px' } }, grid, captionLine);

  const hover = (id, node) => {
    node.addEventListener('pointerenter', (e) => e.pointerType === 'mouse' && ((hovered = id), update()));
    node.addEventListener('pointerleave', () => hovered === id && ((hovered = null), update()));
  };

  const anyone = h('button', { class: 'circle anyone', onclick: () => sendToAnyone() });
  hover(ANYONE, anyone);
  const add = h('button', { class: 'circle add', onclick: () => go(m.contacts.length === 0 ? '#/add' : '#/book') }, icon('plus'));
  grid.append(anyone, add);

  function circle(contact) {
    const node = h('button', { class: 'circle', dataset: { circle: contact.id } });
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
      // Reorders live while the dragged one passes over the others.
      onMove: (e) => {
        const over = document.elementFromPoint(e.clientX, e.clientY)?.closest('[data-circle]')?.dataset.circle;
        if (over && over !== dragging) moveCircle(dragging, over);
      },
      onEnd: () => {
        dragging = null;
        update();
      },
    }));
    hover(contact.id, node);
    grid.insertBefore(node, add);
    return node;
  }

  function update() {
    const now = Date.now();
    const close = closeContacts(m);
    const seen = new Set();
    close.forEach((contact, index) => {
      seen.add(contact.id);
      const node = buttons.get(contact.id) ?? circle(contact);
      buttons.set(contact.id, node);
      const color = colorFor(m, contact);
      const sent = m.sent === contact.id;
      node.className = 'circle' + (sent || hovered === contact.id ? ' lift' : '') + (dragging === contact.id ? ' dragging' : '');
      node.style.order = index + 1;
      node.style.background = sent ? color.ring : color.tint;
      node.style.color = sent ? 'var(--paper)' : color.deep;
      node.style.boxShadow = `inset 0 0 0 3px ${color.ring}`;
      node.title = contact.label;
      node.setAttribute('aria-label', contact.label);
      node.textContent = sent ? '♥' : firstLetter(contact.label);
    });
    for (const [id, node] of buttons) {
      if (!seen.has(id)) {
        node.remove();
        buttons.delete(id);
      }
    }
    add.style.order = close.length + 1;
    const addHelp = m.contacts.length === 0 ? tr('Добавить по ссылке') : tr('Добавить кружок');
    add.title = addHelp;
    add.setAttribute('aria-label', addHelp);

    // "Кому-нибудь на свете": one signal an hour to a random person online.
    // The ring fills back up over the hour.
    const wait = anyoneWait(now);
    const help = wait != null
      ? tr('Кому-нибудь на свете: снова через {n} мин', { n: wait })
      : tr('Кому-нибудь на свете: сигнал уйдёт случайному человеку, раз в час. Он не узнает, от кого.');
    anyone.title = help;
    anyone.setAttribute('aria-label', help);
    anyone.classList.toggle('lift', hovered === ANYONE);
    anyone.style.color = wait == null ? 'var(--star)' : 'var(--star-off)';
    anyone.style.opacity = m.anyoneSending ? 0.6 : 1;
    const r = 23.5;
    const length = 2 * Math.PI * r;
    const progress = wait != null ? (60 - wait) / 60 : 0;
    const ring = h('svg', { class: 'ring', viewBox: '0 0 50 50', 'aria-hidden': 'true' },
      h('circle', { cx: '25', cy: '25', r: String(r), fill: 'none', stroke: 'var(--star)', 'stroke-width': '3', opacity: wait == null ? '1' : '0.25' }),
      wait != null && h('circle', { cx: '25', cy: '25', r: String(r), fill: 'none', stroke: 'var(--star)', 'stroke-width': '3', 'stroke-linecap': 'round', 'stroke-dasharray': `${length * progress} ${length}` }));
    anyone.replaceChildren(ring, icon('sparkles', 21));

    captionLine.fill(captionText(close, now));
  }

  function captionText(close, now) {
    // "Улетело" only right after: later in the hour it would be stale.
    const justSent = settings.anyoneSentAt != null && now - settings.anyoneSentAt < 120_000;
    if (hovered === ANYONE || (hovered == null && m.sent == null && justSent)) {
      const wait = anyoneWait(now);
      const text = justSent ? tr('Улетело кому-то ♥') : wait != null ? tr('Кому-нибудь — через {n} мин', { n: wait }) : tr('Кому-нибудь на свете');
      return h('span', { class: 'muted' }, text);
    }
    const focus = close.find((c) => c.id === (m.sent ?? hovered));
    if (focus) {
      const text = m.sent === focus.id ? tr('{name} — улетело ♥', { name: focus.label }) : focus.label;
      return h('span', { style: { color: colorFor(m, focus).deep } }, text);
    }
    if (close.length === 0 && m.contacts.length > 0) return h('span', { class: 'faint' }, tr('Нажми «+», чтобы добавить кружки'));
    return ' ';
  }

  return { el, update };
}
