// «Подключить устройство»: a watch or a lamp shows six digits (and a QR of
// lovearound.me/login/devices#<digits>, which comes here as /pair#<digits>);
// the person types or brings them, sees what the device is and what it may
// do, and confirms. The server gives the device its token; this page never
// sees it. The flow is in the server repo, docs/schema.md, "Pairing a device
// by code".

import { h, icon } from './lib.js';
import { tr } from './i18n.js';
import * as api from './api.js';
import * as auth from './auth.js';
import { go } from './router.js';
import { slot, note, caption, iconButton } from './ui.js';

const DIGITS = 6;
/// A code lives 10 minutes on the server; one kept here no longer.
const KEEP_FOR = 10 * 60_000;
const KEY = 'lovearound.pairCode';

/// Only the digits: "482 913", "482-913" → "482913".
const digitsOf = (text) => String(text || '').replace(/\D/g, '').slice(0, DIGITS);

/// A code brought in the address (/pair#482913 or #/pair/482913) moves out of
/// it right away, into this tab only (sessionStorage, so that it outlives a
/// sign-in that goes by redirect), and the address becomes #/pair. True when
/// the address was a pairing one.
export function takeCode() {
  const path = location.pathname.replace(/\/+$/, '');
  const inPath = path === '/pair';
  const inHash = /^#\/?pair(\/|$)/.test(location.hash);
  if (!inPath && !inHash) return false;
  const raw = inPath ? location.hash.slice(1) : location.hash.replace(/^#\/?pair\/?/, '');
  const code = digitsOf(decodeURIComponent(raw));
  if (code.length === DIGITS) keep(code);
  history.replaceState(null, '', '/#/pair');
  return true;
}

function keep(code) {
  try {
    sessionStorage.setItem(KEY, JSON.stringify({ code, at: Date.now() }));
  } catch {
    // The page still has it below.
  }
  brought = { code, at: Date.now() };
}

let brought = null;

function keptCode() {
  let kept = brought;
  if (!kept) {
    try {
      kept = JSON.parse(sessionStorage.getItem(KEY) || 'null');
    } catch {
      kept = null;
    }
  }
  return kept && Date.now() - kept.at < KEEP_FOR ? kept.code : '';
}

function forgetCode() {
  brought = null;
  try {
    sessionStorage.removeItem(KEY);
  } catch {
    // Nothing kept.
  }
}

const KIND_ICONS = { watch: 'watch', lamp: 'lamp' };

/// What the card promises, from what the device asked for. The server holds
/// the device to it: without `send` it can't read the people either.
function promises(caps) {
  const receives = caps.includes('receive'), sends = caps.includes('send');
  if (receives && sends) return [tr('увидит твоих людей'), tr('будет отправлять и получать сигналы')];
  if (sends) return [tr('увидит твоих людей'), tr('будет отправлять сигналы, получать не будет')];
  return [tr('будет получать сигналы'), tr('людей не увидит, отправлять не сможет')];
}

function pairMessage(e) {
  if (e instanceof api.ApiError && e.status === 404) return tr('Такого кода нет или он устарел. Проверь цифры или попроси у устройства новый.');
  if (e instanceof api.ApiError && e.status === 429) return tr('Слишком много попыток, попробуй через час');
  return api.apiMessage(e);
}

export function pairScreen() {
  let code = keptCode();
  let card = null; // { name, kind, capabilities } for `code`
  let looking = false;
  let busy = false;
  let error = null;
  let done = null; // the device's name, once connected

  const input = h('input', {
    class: 'code-input', inputmode: 'numeric', pattern: '[0-9]*', autocomplete: 'off', maxlength: String(DIGITS + 2),
    'aria-label': tr('Код с экрана устройства'),
  });
  input.value = code;
  const cells = slot('div', { class: 'code-cells', 'aria-hidden': 'true' });
  const cellsBox = h('label', { class: 'code-box' }, cells, input);
  const cardBox = slot();
  const errorBox = slot();
  const actions = slot('div', { class: 'col', style: { gap: '8px' } });

  input.addEventListener('input', () => {
    const typed = digitsOf(input.value);
    if (input.value !== typed) input.value = typed;
    if (typed !== code) {
      code = typed;
      card = null;
      error = null;
      look();
    }
    update();
  });
  input.addEventListener('focus', () => cellsBox.classList.add('focus'));
  input.addEventListener('blur', () => cellsBox.classList.remove('focus'));

  /// The card for six digits, as soon as they are there (again, if they
  /// changed while the server was asked).
  async function look() {
    if (code.length !== DIGITS || looking) return;
    const wanted = code;
    looking = true;
    update();
    try {
      const found = await api.findPairing(wanted);
      if (code === wanted) card = found;
    } catch (e) {
      if (code === wanted) error = pairMessage(e);
    }
    looking = false;
    if (code !== wanted) look();
    update();
  }

  async function confirm() {
    if (!card || busy) return;
    busy = true;
    error = null;
    update();
    try {
      await api.confirmPairing(code);
      done = card.name;
      forgetCode();
    } catch (e) {
      error = pairMessage(e);
      if (e instanceof api.ApiError && e.status === 404) card = null;
    }
    busy = false;
    update();
  }

  function leave() {
    forgetCode();
    go('#/settings/devices', true);
  }

  const form = h('div', { class: 'col', style: { gap: '14px' } },
    h('div', { class: 'row', style: { gap: '6px' } },
      iconButton('chevronLeft', tr('Назад'), leave),
      h('h1', { class: 'title grow' }, tr('Подключить устройство'))),
    h('div', { class: 'col', style: { gap: '8px' } },
      h('div', { class: 'muted small' }, tr('Код с экрана устройства')),
      cellsBox),
    errorBox,
    cardBox,
    actions);
  const finished = slot('div', { class: 'col center pair-done' });
  const el = h('div', { class: 'page pair col' }, form, finished);

  function update() {
    form.hidden = !!done;
    if (done) {
      finished.fill(
        h('div', { class: 'hello-heart' }, icon('heart', 30)),
        h('h1', { class: 'hello' }, tr('Подключено')),
        h('div', { class: 'muted' }, tr('{name} теперь в твоём аккаунте. Отключить можно в настройках, в «Устройствах».', { name: done })),
        h('button', { class: 'primary', onclick: () => go('#/settings/devices', true) }, tr('Готово')));
      return;
    }
    finished.fill();
    const shown = code.padEnd(DIGITS, ' ').split('');
    cells.fill(shown.map((d, i) => [
      i === DIGITS / 2 && h('i'),
      h('span', { class: i === Math.min(code.length, DIGITS - 1) ? 'at' : '' }, d.trim()),
    ]));
    errorBox.fill(error && h('div', { class: 'error', role: 'alert' }, icon('alert', 14), h('span', null, error)));
    if (!card) {
      cardBox.fill(looking
        ? h('div', { class: 'note' }, tr('Ищем устройство…'))
        : !error && note(tr('Цифры видны на экране часов, лампы или другого устройства. Код живёт 10 минут.')));
      actions.fill(h('button', { class: 'secondary', onclick: leave }, tr('Отмена')));
      return;
    }
    const email = auth.shownEmail() ?? auth.user()?.email ?? '';
    cardBox.fill(h('div', { class: 'col', style: { gap: '8px' } },
      h('div', { class: 'card pair-card' },
        h('div', { class: 'row', style: { gap: '10px' } },
          h('span', { class: 'pair-kind' }, icon(KIND_ICONS[card.kind] ?? 'cpu', 16)),
          h('span', { class: 'title ellipsis grow' }, card.name)),
        h('ul', null, promises(card.capabilities || []).map((line) => h('li', null, line)))),
      h('div', { class: 'card pair-account' },
        caption(tr('В аккаунт')),
        h('div', { class: 'ellipsis' }, email)),
      note(tr('Подключай только свои устройства. Если код тебе прислали, не вводи его.'))));
    actions.fill(
      h('button', { class: 'primary', disabled: busy, onclick: confirm }, busy ? tr('Подключаем…') : tr('Подключить')),
      h('button', { class: 'secondary', onclick: leave }, tr('Отмена')));
  }

  update();
  look();
  // However the page is left, the code goes with it.
  return { el, update, focus: () => !code && input.focus(), leave: forgetCode };
}
