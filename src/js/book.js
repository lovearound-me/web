// The book: everyone, split into "Рядом" (the circles on the first screen,
// in their order) and "Остальные"; the chosen one beside them on a wide
// screen, instead of them on a phone.

import { h, icon, closeContacts, contactsByName, colorFor, colorIndex, palette, contains, peopleCount, startDrag } from './lib.js';
import { tr } from './i18n.js';
import { m, place, setClose, updateContact, remove } from './model.js';
import { slot, avatar, caption, note, iconButton, linkRow, searchField, switchRow, colorBlock, contactForm } from './ui.js';
import { apiMessage } from './api.js';
import { go } from './router.js';

export function bookScreen(r) {
  const adding = r.adding;
  const selected = adding ? null : r.id;
  let query = '';
  let drag = null; // { id, label, x, y, drop }

  const search = searchField((value) => {
    query = value.trim();
    renderList();
  });
  const list = slot('div', { class: 'list' });
  const ghost = slot('div', { class: 'ghost', hidden: true });
  const side = h('div', { class: 'side' },
    h('div', { class: 'row side-head', style: { gap: '6px' } },
      iconButton('chevronLeft', tr('Назад'), () => go('#/')),
      h('h1', { class: 'title grow' }, tr('Книга'))),
    h('div', { style: { padding: '0 10px 4px' } }, search.el),
    list,
    h('div', { class: 'col side-foot' },
      linkRow('plusCircle', tr('Добавить по ссылке'), () => go('#/book/new')),
      note(tr('Перетаскивай людей между «Рядом» и «Остальные» (на телефоне — подержи и тащи). Порядок в «Рядом» — порядок кружков наверху.'))),
    ghost);

  // The right side keeps its inputs while the book changes around it.
  let detail;
  if (adding) {
    const form = contactForm({ onBack: () => go('#/book'), onAdded: (id) => go(`#/book/${encodeURIComponent(id)}`, true) });
    detail = { el: h('div', { class: 'detail-page' }, form.el), update() {}, focus: form.focus };
  } else if (selected) {
    detail = personPage(selected);
  } else {
    detail = emptyDetail();
  }
  const el = h('div', { class: 'page book' + (adding || selected ? ' has-detail' : '') }, side, h('div', { class: 'detail' }, detail.el));

  /// Where a drop at this point would go, and which line to draw.
  function target(x, y, dragId) {
    const close = closeContacts(m).filter((c) => c.id !== dragId);
    const node = document.elementFromPoint(x, y);
    const row = node?.closest('[data-row]');
    if (row && list.contains(row)) {
      const id = row.dataset.row;
      if (id === dragId) return null;
      if (row.dataset.close === '1') {
        const before = close.findIndex((c) => c.id === id);
        const box = row.getBoundingClientRect();
        const after = y > box.top + box.height / 2;
        return { closeAt: before + (after ? 1 : 0), mark: { id, side: after ? 'after' : 'before' } };
      }
      return { closeAt: null, mark: { heading: 'others' } };
    }
    const heading = node?.closest('[data-heading]')?.dataset.heading;
    if (heading === 'close') return { closeAt: close.length, mark: { heading: 'close' } };
    if (heading === 'others') return { closeAt: null, mark: { heading: 'others' } };
    if (node && list.contains(node)) {
      // Empty space under "Рядом" or the end of the list.
      const othersTop = list.querySelector('[data-heading=others]')?.getBoundingClientRect().top ?? Infinity;
      return y < othersTop ? { closeAt: close.length, mark: { heading: 'close' } } : { closeAt: null, mark: { heading: 'others' } };
    }
    return null;
  }

  /// While dragging only the marks and the ghost change: the rows stay.
  function showMarks() {
    const mark = drag?.drop?.mark;
    for (const row of list.querySelectorAll('[data-row]')) {
      row.classList.toggle('drop-before', mark?.id === row.dataset.row && mark.side === 'before');
      row.classList.toggle('drop-after', mark?.id === row.dataset.row && mark.side === 'after');
      row.classList.toggle('dragging', drag?.id === row.dataset.row);
    }
    for (const heading of list.querySelectorAll('[data-heading]')) heading.classList.toggle('drop-target', mark?.heading === heading.dataset.heading);
    ghost.hidden = !drag;
    if (drag) {
      ghost.style.left = drag.x + 12 + 'px';
      ghost.style.top = drag.y - 14 + 'px';
    }
  }

  function startRow(contact) {
    return (event) => startDrag(event, {
      onStart: (e) => {
        drag = { id: contact.id, x: e.clientX, y: e.clientY, drop: null };
        ghost.fill(avatar(contact.label, colorFor(m, contact), 20), contact.label);
        showMarks();
      },
      onMove: (e) => {
        drag = { ...drag, x: e.clientX, y: e.clientY, drop: target(e.clientX, e.clientY, contact.id) };
        showMarks();
      },
      onEnd: (e, drop) => {
        const where = drop ? target(e.clientX, e.clientY, contact.id) : null;
        drag = null;
        showMarks();
        if (where && !(where.closeAt == null && !contact.close)) place(contact.id, where.closeAt);
        else renderList();
      },
    });
  }

  function row(contact, draggable) {
    const node = h('button', {
      class: 'book-row' + (selected === contact.id ? ' on' : ''),
      dataset: { row: contact.id, close: contact.close ? '1' : '0' },
      onclick: () => go(`#/book/${encodeURIComponent(contact.id)}`, !!(selected || adding)),
    }, avatar(contact.label, colorFor(m, contact), 26), h('span', { class: 'grow ellipsis' }, contact.label));
    if (draggable) {
      node.addEventListener('pointerdown', startRow(contact));
      node.addEventListener('contextmenu', (e) => e.preventDefault());
    }
    return node;
  }

  function renderList() {
    search.setPlaceholder(tr('Найти — {people}', { people: peopleCount(m.contacts.length) }));
    if (query) {
      const found = contactsByName(m).filter((c) => contains(c.label, query));
      list.fill(found.map((c) => row(c, false)),
        found.length === 0 && h('div', { class: 'muted center', style: { padding: '14px 0' } }, tr('Никого с таким именем')));
      return;
    }
    const close = closeContacts(m);
    const others = contactsByName(m).filter((c) => !c.close);
    list.fill(
      h('div', { class: 'book-heading row', dataset: { heading: 'close' }, style: { gap: '6px' } },
        h('span', { style: { color: 'var(--heart)', fontSize: '11px' }, class: 'row' }, icon('heart')),
        caption(tr('Рядом')), h('span', { class: 'note' }, tr('кружки наверху'))),
      close.map((c) => row(c, true)),
      close.length === 0 && h('div', { class: 'note', style: { padding: '4px 6px 8px' } }, tr('Перетащи сюда тех, кому хочешь нажимать в один клик')),
      h('div', { class: 'book-heading others', dataset: { heading: 'others' } }, caption(tr('Остальные'))),
      others.map((c) => row(c, true)),
      others.length === 0 && m.contacts.length > 0 && h('div', { class: 'note', style: { padding: '4px 6px 8px' } }, tr('Перетащи сюда, чтобы убрать кружок')));
  }

  function update() {
    if (selected && m.loaded && !m.contacts.some((c) => c.id === selected)) {
      go('#/book', true);
      return;
    }
    renderList();
    detail.update();
  }

  update();
  return {
    el,
    update,
    focus: detail.focus,
    // A drag in progress: the rows must stay where the finger is.
    busy: () => drag != null,
    leave: detail.leave,
  };
}

function emptyDetail() {
  const box = slot('div', { class: 'col center empty-detail' });
  return {
    el: box,
    update() {
      const empty = m.loaded && m.contacts.length === 0;
      box.fill(
        h('div', { class: 'faint', style: { fontSize: '34px' } }, icon('book')),
        h('div', { class: 'strong', style: { fontSize: '15px' } }, empty ? tr('Пока никого нет') : tr('Выбери человека слева')),
        h('div', { class: 'muted', style: { maxWidth: '280px' } }, empty ? tr('Добавь людей по их ссылке или поделись своим Love ID.') : tr('Здесь меняются имя и цвет.')));
    },
  };
}

/// The name (saved a moment after typing stops), the color, the circle.
function personPage(id) {
  const contact0 = m.contacts.find((c) => c.id === id);
  let color = contact0 ? colorIndex(m, contact0) : 0;
  let confirm = false;
  let status = null; // 'saving' | 'saved' | error text
  let timer = null;

  const name = h('input', { class: 'name-input grow', maxlength: '64', spellcheck: 'false', autocomplete: 'off', 'aria-label': tr('Как назовёшь?') });
  name.value = contact0?.label ?? '';
  const face = slot();
  const colors = slot();
  const closeRow = slot('div', { class: 'card' });
  const whoNote = note();
  const actions = slot('div', { class: 'row', style: { gap: '10px', minHeight: '30px', flexWrap: 'wrap' } });

  const contact = () => m.contacts.find((c) => c.id === id);

  async function saveNow() {
    clearTimeout(timer);
    timer = null;
    const label = name.value.trim();
    if (!label || label.length > 64 || !contact()) return;
    status = 'saving';
    update();
    try {
      await updateContact(id, label, color);
      status = 'saved';
    } catch {
      status = tr('Не получилось сохранить');
    }
    update();
  }

  name.addEventListener('input', () => {
    clearTimeout(timer);
    timer = setTimeout(saveNow, 700);
    update();
  });
  name.addEventListener('keydown', (e) => e.key === 'Enter' && saveNow());
  name.addEventListener('blur', () => timer && saveNow());

  async function removeNow() {
    try {
      await remove(id);
      go('#/book', true);
    } catch (e) {
      confirm = false;
      status = apiMessage(e) || tr('Не получилось удалить');
      update();
    }
  }

  function update() {
    const c = contact();
    if (!c) return;
    const p = palette(color);
    face.fill(avatar(name.value || c.label, p, 56));
    colors.fill(colorBlock(color, (i) => { color = i; saveNow(); }, 34));
    closeRow.fill(switchRow(tr('Кружок наверху'), c.close, (on) => setClose(id, on)));
    whoNote.textContent = tr('{name} не увидит ни имя, ни цвет: их видишь только ты.', { name: name.value.trim() || tr('Человек') });
    actions.fill(
      confirm
        ? [h('span', { class: 'small' }, tr('Удалить из книги?')),
          h('button', { class: 'pill', onclick: () => { confirm = false; update(); } }, tr('Отмена')),
          h('button', { class: 'pill danger-fill', onclick: removeNow }, tr('Удалить'))]
        : h('button', { class: 'row danger small', style: { gap: '6px' }, onclick: () => { confirm = true; update(); } }, icon('trash'), tr('Удалить из книги')),
      h('span', { class: 'grow' }),
      status && h('span', { class: 'small ' + (status === 'saving' || status === 'saved' ? 'faint' : 'danger') },
        status === 'saving' ? tr('Сохраняем…') : status === 'saved' ? tr('Сохранено') : status));
  }

  const el = h('div', { class: 'col detail-page', style: { gap: '20px' } },
    h('div', { class: 'row narrow-only' }, iconButton('chevronLeft', tr('Назад'), () => go('#/book'))),
    h('div', { class: 'row', style: { gap: '14px' } }, face, name),
    colors, closeRow, whoNote, actions);
  update();
  return {
    el,
    update,
    // A change not yet saved goes out when another person is chosen.
    leave: () => timer && saveNow(),
  };
}
