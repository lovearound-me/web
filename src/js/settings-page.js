// The settings: how a signal looks, when it may come, own devices, the
// account. Ported from the Windows app's settings; what only a desktop app
// can do (start with the computer, quiet during a presentation) is left out.

import { h, icon, palette, copyText } from './lib.js';
import { tr, LANG, LANGUAGES } from './i18n.js';
import { settings, save } from './settings.js';
import { SITE, DOWNLOADS, VERSION } from './config.js';
import * as api from './api.js';
import { m, changed, isPaused, pauseText, pause, resume, setAcceptAnyone, playEffect, signOut, deleteAccount, addDevice, forgetCreatedDevice } from './model.js';
import { slot, avatar, caption, note, field, switchRow, linkRow, inviteRow, swatchPicker, iconButton } from './ui.js';
import { go } from './router.js';

const TABS = () => [['signal', tr('Сигнал')], ['when', tr('Когда')], ['devices', tr('Устройства')], ['account', tr('Аккаунт')]];

export function settingsScreen(r) {
  const tab = r.tab;
  const page = tab === 'signal' ? signalTab() : tab === 'when' ? whenTab() : tab === 'devices' ? devicesTab() : accountTab();
  const el = h('div', { class: 'page settings col', style: { gap: '16px' } },
    h('div', { class: 'row', style: { gap: '6px' } },
      iconButton('chevronLeft', tr('Назад'), () => go('#/')),
      h('h1', { class: 'title grow' }, tr('Настройки'))),
    h('div', { class: 'tabs', role: 'tablist' },
      TABS().map(([id, title]) => h('button', { class: tab === id ? 'on' : '', role: 'tab', 'aria-selected': String(tab === id), onclick: () => go(`#/settings/${id}`, true) }, title))),
    page.el);
  return { el, update: page.update };
}

const setSetting = (key, value) => {
  settings[key] = value;
  save();
  changed();
};

/// A slider whose label follows it; it never re-renders the page while moved.
function slider({ min, max, step, value, onInput }) {
  const input = h('input', { type: 'range', min: String(min), max: String(max), step: String(step) });
  input.value = String(value);
  input.addEventListener('input', () => onInput(Number(input.value)));
  return input;
}

// ---- Сигнал ----------------------------------------------------------------------

function signalTab() {
  const colorName = h('span', { class: 'small' });
  const colors = slot();
  const countLabel = h('span', { class: 'small muted' });
  const count = slider({
    min: 0, max: 60, step: 2, value: settings.emojiCount,
    onInput: (n) => {
      settings.emojiCount = n;
      save();
      countLabel.textContent = n === 0 ? tr('только свет') : String(n);
    },
  });
  const calmNote = slot();
  const switches = slot('div', { class: 'card' });

  const el = h('div', { class: 'col', style: { gap: '18px' } },
    h('div', { class: 'col', style: { gap: '8px' } },
      h('div', { class: 'row' }, caption(tr('Мой цвет сигнала')), h('span', { class: 'grow' }), colorName),
      colors,
      note(tr('Этим цветом светятся края экрана, когда кто-то о тебе думает.'))),
    h('div', { class: 'col', style: { gap: '4px' } },
      h('div', { class: 'row' }, caption(tr('Смайликов за раз')), h('span', { class: 'grow' }), countLabel),
      count, calmNote),
    switches,
    h('button', { class: 'play', onclick: () => playEffect() }, icon('play'), tr('Показать, как это выглядит')));

  function update() {
    const p = palette(settings.myColor);
    colorName.textContent = p.name;
    colorName.style.color = p.deep;
    colors.fill(swatchPicker(settings.myColor, (i) => setSetting('myColor', i), 34));
    countLabel.textContent = settings.emojiCount === 0 ? tr('только свет') : String(settings.emojiCount);
    count.value = String(settings.emojiCount);
    count.disabled = settings.calm;
    calmNote.fill(settings.calm && note(tr('С «Без мигания и полёта» смайлики не летают.')));
    switches.fill(
      switchRow(tr('Тихий звук'), settings.sound, (v) => setSetting('sound', v)),
      h('hr'),
      switchRow(tr('Без мигания и полёта'), settings.calm, (v) => setSetting('calm', v)));
  }
  update();
  return { el, update };
}

// ---- Когда -----------------------------------------------------------------------

const GAPS = [1, 5, 15, 30, 60, 300, 900, 3600];

const gapTitle = (gap) => (gap < 60 ? tr('{n} с', { n: gap }) : gap < 3600 ? tr('{n} мин', { n: gap / 60 }) : tr('{n} ч', { n: gap / 3600 }));

function nearestGap(gap) {
  let best = 0;
  GAPS.forEach((g, i) => {
    if (Math.abs(g - gap) < Math.abs(GAPS[best] - gap)) best = i;
  });
  return best;
}

function whenTab() {
  const pauseBox = slot('div', { class: 'col', style: { gap: '8px' } });
  const gapLabel = h('span', { class: 'small muted' });
  const gap = slider({
    min: 0, max: GAPS.length - 1, step: 1, value: nearestGap(settings.minGap),
    onInput: (i) => {
      settings.minGap = GAPS[i];
      save();
      gapLabel.textContent = gapTitle(GAPS[i]);
    },
  });
  const anyone = slot('div', { class: 'anyone-card col', style: { gap: '6px' } });
  const problem = slot();

  const el = h('div', { class: 'col', style: { gap: '18px' } },
    // The browser receives only while this tab is open: said where receiving is set up.
    h('div', { class: 'web-line row' },
      icon('laptop'),
      h('span', { class: 'grow' },
        tr('В браузере сердечки приходят, только пока вкладка открыта. Приложение для компьютера ловит их всегда.'), ' ',
        h('a', { class: 'link strong', href: DOWNLOADS, target: '_blank', rel: 'noopener' }, tr('Скачать приложение')))),
    pauseBox,
    h('div', { class: 'col', style: { gap: '4px' } },
      h('div', { class: 'row' }, caption(tr('Свечение не чаще раза в')), h('span', { class: 'grow' }), gapLabel),
      gap,
      note(tr('Если о тебе думают часто, сигналы между вспышками не покажутся.'))),
    anyone,
    problem);

  function update() {
    const paused = isPaused();
    pauseBox.fill(
      caption(paused ? pauseText() : tr('Пауза')),
      paused
        ? h('button', { class: 'secondary', onclick: resume }, tr('Снять паузу'))
        : h('div', { class: 'row wrap', style: { gap: '8px' } },
          h('button', { class: 'secondary grow', onclick: () => pause('hour') }, tr('На час')),
          h('button', { class: 'secondary grow', onclick: () => pause('untilMorning') }, tr('До утра')),
          h('button', { class: 'secondary grow', onclick: () => pause('untilResumed') }, tr('Пока не сниму'))));
    gapLabel.textContent = gapTitle(GAPS[nearestGap(settings.minGap)]);
    anyone.fill(
      switchRow(tr('Сердечки от кого-нибудь на свете'), settings.acceptAnyone, setAcceptAnyone),
      h('div', { class: 'note', style: { padding: '0 12px 10px' } }, tr('Кто-то где-то нажал «Кому-нибудь на свете», и сердечко может прилететь тебе. Бывает редко, тем и приятнее.')));
    problem.fill(m.problem && h('div', { class: 'small danger' }, m.problem));
  }
  update();
  return { el, update };
}

// ---- Устройства --------------------------------------------------------------------

const relative = new Intl.RelativeTimeFormat(LANG, { numeric: 'auto' });

/// "5 минут назад", "вчера".
function ago(iso) {
  const seconds = (new Date(iso).getTime() - Date.now()) / 1000;
  for (const [unit, size] of [['day', 86400], ['hour', 3600], ['minute', 60]]) {
    if (Math.abs(seconds) >= size) return relative.format(Math.round(seconds / size), unit);
  }
  return tr('только что');
}

/// "Принимает и отправляет · был онлайн 5 минут назад".
function details(device) {
  const caps = device.capabilities || [];
  const receives = caps.includes('receive'), sends = caps.includes('send');
  const text = receives && sends ? tr('Принимает и отправляет') : receives ? tr('Принимает') : sends ? tr('Отправляет') : '';
  return text + (device.last_seen_at ? tr(' · был онлайн {ago}', { ago: ago(device.last_seen_at) }) : tr(' · ещё не подключался'));
}

function devicesTab() {
  let devices = null;
  let failed = false;
  let receives = true;
  let sends = true;
  let busy = false;
  let error = null;
  let removing = null;

  const name = h('input', { maxlength: '40', placeholder: tr('Например, Котик на полке'), autocomplete: 'off' });
  const kinds = slot('div', { class: 'card' });
  const button = h('button', { class: 'primary', onclick: () => add() });
  const errorBox = slot();
  const listBox = slot();
  const form = h('div', { class: 'col', style: { gap: '16px' } },
    note(tr('Игрушка, лампа или своя плата, которая светится, когда о тебе думают, или отправляет сердечко по кнопке.')),
    h('div', { class: 'col', style: { gap: '10px' } }, field(tr('Название'), name), kinds, button, errorBox),
    listBox,
    linkRow('book', tr('Как подключить свою плату'), null, SITE + '/docs'));
  const created = slot();
  const el = h('div', null, form, created);

  name.addEventListener('input', () => update());
  name.addEventListener('keydown', (e) => e.key === 'Enter' && add());

  const load = () => api.devices().then(
    (list) => { devices = list; failed = false; update(); },
    () => { failed = true; update(); });

  async function add() {
    const capabilities = [...(receives ? ['receive'] : []), ...(sends ? ['send'] : [])];
    if (!name.value.trim() || capabilities.length === 0 || busy) return;
    busy = true;
    error = null;
    update();
    try {
      await addDevice(name.value.trim(), capabilities);
      name.value = '';
      load();
    } catch (e) {
      error = api.apiMessage(e);
    }
    busy = false;
    update();
  }

  async function removeDevice(id) {
    try {
      await api.deleteDevice(id);
      removing = null;
      load();
    } catch {
      removing = null;
      error = tr('Не получилось отключить, попробуй ещё раз');
      update();
    }
  }

  function update() {
    const made = m.createdDevice;
    form.hidden = !!made;
    if (made) {
      const copyButton = h('button', { class: 'primary grow' }, icon('copy'), tr('Скопировать токен'));
      copyButton.addEventListener('click', async () => {
        if (!(await copyText(made.token))) return;
        copyButton.replaceChildren(icon('check'), tr('Скопировано'));
        setTimeout(() => copyButton.replaceChildren(icon('copy'), tr('Скопировать токен')), 1800);
      });
      created.fill(h('div', { class: 'col', style: { gap: '12px' } },
        h('div', { class: 'title' }, tr('«{name}» подключено', { name: made.name })),
        h('div', { class: 'card token selectable' }, made.token),
        note(tr('Это токен устройства. Мы покажем его только сейчас: скопируй и вставь в прошивку. С ним можно отправлять сердечки от твоего имени, так что никому не показывай.')),
        h('div', { class: 'row wrap', style: { gap: '8px' } },
          copyButton,
          h('button', { class: 'secondary grow', onclick: forgetCreatedDevice }, tr('Готово')))));
      return;
    }
    created.fill();
    kinds.fill(
      switchRow(tr('Принимает сердечки'), receives, (v) => { receives = v; update(); }),
      h('hr'),
      switchRow(tr('Отправляет сердечки'), sends, (v) => { sends = v; update(); }));
    button.disabled = !(name.value.trim() && (receives || sends) && !busy);
    button.textContent = busy ? tr('Подключаем…') : tr('Подключить устройство');
    errorBox.fill(error && h('div', { class: 'small danger' }, error));
    listBox.fill(
      failed && h('div', { class: 'small danger' }, tr('Не получилось загрузить устройства')),
      devices && devices.length > 0 && h('div', { class: 'col', style: { gap: '6px' } },
        caption(tr('Подключены')),
        h('div', { class: 'card' }, devices.map((d, i) => h('div', null,
          i > 0 && h('hr'),
          h('div', { class: 'row device' },
            h('div', { class: 'col grow' },
              h('span', { class: 'ellipsis' }, d.name),
              h('span', { class: 'note' }, details(d))),
            removing === d.id
              ? [h('button', { class: 'pill', onclick: () => { removing = null; update(); } }, tr('Нет')),
                h('button', { class: 'pill danger-fill', onclick: () => removeDevice(d.id) }, tr('Отключить'))]
              : h('button', { class: 'icon-button faint', title: tr('Отключить'), 'aria-label': tr('Отключить'), onclick: () => { removing = d.id; update(); } }, icon('trash'))))))));
  }

  update();
  load();
  return { el, update };
}

// ---- Аккаунт ---------------------------------------------------------------------

function accountTab() {
  let confirm = false;
  let busy = false;
  let error = null;
  const box = slot('div', { class: 'col', style: { gap: '18px' } });

  async function removeAccount() {
    busy = true;
    error = null;
    update();
    try {
      await deleteAccount();
    } catch (e) {
      error = api.apiMessage(e);
      busy = false;
      update();
    }
  }

  const language = h('select', { class: 'language', 'aria-label': tr('Язык') },
    h('option', { value: '' }, tr('Как в браузере')),
    LANGUAGES.map(([code, title]) => h('option', { value: code }, title)));
  language.value = settings.language || '';
  // Everything in the language just chosen: the page loads again.
  language.addEventListener('change', () => {
    settings.language = language.value;
    save();
    location.reload();
  });

  function update() {
    box.fill(
      h('div', { class: 'row card', style: { gap: '12px', padding: '12px' } },
        avatar(m.email || '♥', palette(settings.myColor), 40),
        h('div', { class: 'col grow' },
          h('span', { class: 'ellipsis strong' }, m.email || ''),
          h('span', { class: 'note' }, tr('Книга хранится в аккаунте'))),
        h('button', { class: 'small-button', onclick: () => signOut() }, tr('Выйти'))),
      h('div', { class: 'col', style: { gap: '6px' } },
        inviteRow(),
        note(tr('Отправь его тем, кто хочет нажимать, когда думает о тебе.'))),
      h('div', { class: 'col', style: { gap: '8px' } },
        confirm
          ? [h('div', { class: 'small' }, tr('Удалить аккаунт и весь список? Это навсегда.')),
            h('div', { class: 'row', style: { gap: '8px' } },
              h('button', { class: 'pill', disabled: busy, onclick: () => { confirm = false; update(); } }, tr('Не удалять')),
              h('button', { class: 'pill danger-fill', disabled: busy, onclick: removeAccount }, tr('Удалить навсегда')))]
          : h('div', { class: 'row', style: { gap: '10px' } },
            h('div', { class: 'col grow' },
              h('span', null, tr('Удалить аккаунт')),
              h('span', { class: 'note' }, tr('Вместе с книгой, устройствами и Love ID.'))),
            h('button', { class: 'small-button danger grow-0', onclick: () => { confirm = true; update(); } }, tr('Удалить…'))),
        error && h('div', { class: 'small danger' }, error)),
      h('div', { class: 'row', style: { gap: '10px' } },
        h('span', { class: 'grow' }, tr('Язык')),
        language),
      h('div', { class: 'note center' }, `Love Around web ${VERSION}`));
  }
  update();
  return { el: box, update };
}

