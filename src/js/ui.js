// The pieces the screens share: avatars, fields, switches, the own link,
// the form for adding someone. Ported from the Windows app's ui/lib.js.

import { h, icon, palette, PALETTE_SIZE, firstLetter, inviteId, nextColor, newContactIsClose, copyText } from './lib.js';
import { tr } from './i18n.js';
import { SITE } from './config.js';
import { m, addContact } from './model.js';
import { apiMessage } from './api.js';

/// A container whose content is replaced as a whole.
export function slot(tag = 'div', props) {
  const el = h(tag, props);
  el.fill = (...children) => {
    el.replaceChildren();
    for (const child of children.flat(Infinity)) {
      if (child == null || child === false || child === true) continue;
      el.append(child instanceof Node ? child : String(child));
    }
    return el;
  };
  return el;
}

export function avatar(label, color, size) {
  return h('div', {
    class: 'avatar',
    style: { width: size + 'px', height: size + 'px', fontSize: size * 0.41 + 'px', color: color.deep, boxShadow: `inset 0 0 0 2.5px ${color.ring}` },
  }, firstLetter(label));
}

export const caption = (...children) => h('div', { class: 'caption' }, ...children);

/// The small grey explanation under a setting.
export const note = (...children) => h('div', { class: 'note' }, ...children);

export const field = (title, input) => h('label', { class: 'field' }, h('span', { class: 'caption' }, title), input);

export function iconButton(name, help, onclick) {
  return h('button', { class: 'icon-button', title: help, 'aria-label': help, onclick }, icon(name));
}

export function linkRow(name, title, onclick, href) {
  return href
    ? h('a', { class: 'link-row', href, target: '_blank', rel: 'noopener' }, icon(name), h('span', null, title))
    : h('button', { class: 'link-row', onclick }, icon(name), h('span', null, title));
}

export function banner(name, text, ...children) {
  return h('div', { class: 'banner', role: 'status' }, icon(name), h('span', { class: 'grow' }, text), ...children);
}

/// Title on the left, switch on the right edge, whatever the title's length.
export function switchRow(title, on, onChange) {
  return h('div', { class: 'switch-row' },
    h('span', { class: 'grow' }, title),
    h('button', { class: 'switch' + (on ? ' on' : ''), role: 'switch', 'aria-checked': String(on), 'aria-label': title, onclick: () => onChange(!on) }));
}

/// A search field that keeps its text and focus between renders.
export function searchField(onInput) {
  const input = h('input', { type: 'search', spellcheck: 'false', autocomplete: 'off', enterkeyhint: 'search' });
  const clear = h('button', { class: 'faint row clear', 'aria-label': tr('Очистить'), onclick: () => { input.value = ''; sync(); input.focus(); } }, icon('xCircle'));
  const sync = () => {
    clear.hidden = !input.value;
    onInput(input.value);
  };
  input.addEventListener('input', sync);
  input.addEventListener('keydown', (e) => e.key === 'Escape' && input.value && (input.value = '', sync()));
  clear.hidden = true;
  const el = h('div', { class: 'search' }, icon('search'), input, clear);
  return { el, input, setPlaceholder: (text) => { input.placeholder = text; } };
}

export function swatchPicker(value, onChange, size) {
  const buttons = [];
  for (let i = 0; i < PALETTE_SIZE; i++) {
    const p = palette(i);
    buttons.push(h('button', {
      class: 'swatch' + (value === i ? ' on' : ''), style: { '--ring': p.ring }, title: p.name, 'aria-label': p.name,
      'aria-pressed': String(value === i), onclick: () => onChange(i),
    }, h('span', { style: { background: p.ring } })));
  }
  return h('div', { class: 'swatches', style: { '--cell': size + 6 + 'px' } }, buttons);
}

/// "Цвет" with the color's name on the right, and the swatches.
export function colorBlock(value, onChange, size) {
  const p = palette(value);
  return h('div', { class: 'col', style: { gap: '8px' } },
    h('div', { class: 'row' }, caption(tr('Цвет')), h('span', { class: 'grow' }), h('span', { class: 'small', style: { color: p.deep } }, p.name)),
    swatchPicker(value, onChange, size));
}

export const INVITE_MESSAGE = () => tr('Добавь меня по этой ссылке и нажимай сердечко, когда думаешь обо мне ♥');

/// The link without the scheme: "lovearound.me/i/…" reads better than a URL.
const shownLink = (link) => link.replace('https://', '').replace('http://', '');

/// The own link as one quiet card: the link itself, copied on a click.
export function inviteRow() {
  if (!m.inviteUrl) return null;
  const label = h('span', { class: 'label' }, tr('Скопировать'));
  const glyph = slot('span', { class: 'row' }).fill(icon('copy'));
  const action = h('span', { class: 'action' }, glyph, label);
  let timer;
  const copy = async () => {
    if (!(await copyText(m.inviteUrl))) return;
    action.classList.add('copied');
    glyph.fill(icon('check'));
    label.textContent = tr('Скопировано');
    clearTimeout(timer);
    timer = setTimeout(() => {
      action.classList.remove('copied');
      glyph.fill(icon('copy'));
      label.textContent = tr('Скопировать');
    }, 1500);
  };
  return h('button', { class: 'invite', onclick: copy, 'aria-label': tr('Скопировать свой Love ID'), title: tr('Кто добавит тебя по этой ссылке, сможет нажимать, когда думает о тебе') },
    h('span', { class: 'badge' }, icon('heart')),
    h('span', { class: 'col grow' },
      h('span', { class: 'muted', style: { fontSize: '11.5px' } }, tr('Твой Love ID')),
      h('span', { class: 'code ellipsis' }, shownLink(m.inviteUrl))),
    action);
}

/// For an empty book: the own link with a line to send along, to paste into a chat.
export function shareButton() {
  if (!m.inviteUrl) return null;
  const button = h('button', { class: 'primary' });
  const idle = () => button.replaceChildren(icon('share'), tr('Скопировать свой Love ID'));
  idle();
  button.addEventListener('click', async () => {
    if (!(await copyText(`${INVITE_MESSAGE()}\n${m.inviteUrl}`))) return;
    button.replaceChildren(icon('check'), tr('Скопировано, отправь в чат'));
    setTimeout(idle, 1800);
  });
  return button;
}

/// Adding someone by their invite link. The server never says whether a
/// code belongs to anyone (so codes can't be probed): only its shape is
/// checked here. Returns { el, focus }.
export function contactForm({ invite, onBack, onAdded }) {
  let color = nextColor(m);
  const close = newContactIsClose(m);
  let busy = false;

  const link = h('input', { placeholder: 'lovearound.me/i/…', spellcheck: 'false', autocomplete: 'off', autocapitalize: 'off' });
  if (invite) link.value = `${SITE}/i/${invite}`;
  const name = h('input', { placeholder: tr('Например, Мама'), maxlength: '64', autocomplete: 'off' });
  const linkHint = slot('div', { class: 'hint' });
  const colors = slot();
  const button = h('button', { class: 'primary', onclick: () => save() });
  const error = slot('div', { class: 'small danger', role: 'alert' });
  const whoNote = note();

  const code = () => (link.value.trim() ? inviteId(link.value) : null);
  const label = () => name.value.trim();
  const canSave = () => label().length >= 1 && label().length <= 64 && code();

  function update() {
    linkHint.fill(!link.value.trim()
      ? h('span', { class: 'faint' }, tr('Вставь ссылку, которую тебе прислали'))
      : code()
        ? h('span', { class: 'ok row', style: { gap: '5px' } }, icon('check'), tr('Ссылка в порядке. Осталось подписать.'))
        : h('span', { class: 'muted' }, tr('Не похоже на ссылку-приглашение')));
    colors.fill(colorBlock(color, (i) => { color = i; update(); }, 32));
    button.disabled = !canSave() || busy;
    button.textContent = busy ? tr('Сохраняем…') : tr('Добавить');
    whoNote.textContent = tr('{name} не увидит ни имя, ни цвет. Кружки можно переставлять перетаскиванием.', { name: label() || tr('Человек') });
  }

  async function save() {
    if (!canSave() || busy) return;
    busy = true;
    error.fill();
    update();
    try {
      const id = await addContact(code(), label(), color, close);
      onAdded?.(id);
    } catch (e) {
      busy = false;
      error.fill(apiMessage(e));
      update();
    }
  }

  link.addEventListener('input', update);
  name.addEventListener('input', update);
  name.addEventListener('keydown', (e) => e.key === 'Enter' && save());
  link.addEventListener('keydown', (e) => e.key === 'Enter' && name.focus());
  update();

  const el = h('div', { class: 'col form', style: { gap: '14px' } },
    onBack && h('div', { class: 'row', style: { gap: '6px' } }, iconButton('chevronLeft', tr('Назад'), onBack), h('h2', { class: 'title' }, tr('Новый человек'))),
    field(tr('Ссылка-приглашение'), link),
    linkHint,
    field(tr('Как назовёшь?'), name),
    colors,
    button,
    error,
    whoNote);
  return { el, focus: () => (link.value ? name : link).focus() };
}
