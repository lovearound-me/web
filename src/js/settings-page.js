// The settings: how a signal looks, when it may come, own devices, the
// account. Ported from the Windows app's settings; what only a desktop app
// can do (start with the computer, quiet during a presentation) is left out.

import { h, icon, palette, copyText, peopleCount } from './lib.js';
import { tr, trn, LANG, LANGUAGES } from './i18n.js';
import { settings, save } from './settings.js';
import { SITE, DOWNLOADS, VERSION } from './config.js';
import * as api from './api.js';
import * as auth from './auth.js';
import { m, changed, isPaused, pauseText, pause, resume, setAcceptAnyone, playEffect, signOut, deleteAccount, addDevice, forgetCreatedDevice, accountChanged, reload } from './model.js';
import { slot, avatar, caption, note, field, switchRow, linkRow, inviteRow, swatchPicker, iconButton, banner } from './ui.js';
import { go } from './router.js';

const TABS = () => [['signal', tr('Сигнал')], ['when', tr('Когда')], ['devices', tr('Устройства')], ['account', tr('Аккаунт')]];

export function settingsScreen(r) {
  if (r.tab === 'merge' && merging) return mergeScreen();
  const tab = r.tab === 'signin' || r.tab === 'merge' ? 'account' : r.tab;
  const page = tab === 'signal' ? signalTab() : tab === 'when' ? whenTab() : tab === 'devices' ? devicesTab() : accountTab(r.tab === 'signin');
  const el = h('div', { class: 'page settings col', style: { gap: '16px' } },
    h('div', { class: 'row', style: { gap: '6px' } },
      iconButton('chevronLeft', tr('Назад'), () => go('#/')),
      h('h1', { class: 'title grow' }, tr('Настройки'))),
    h('div', { class: 'tabs', role: 'tablist' },
      TABS().map(([id, title]) => h('button', { class: tab === id ? 'on' : '', role: 'tab', 'aria-selected': String(tab === id), onclick: () => go(`#/settings/${id}`, true) }, title))),
    page.el);
  return { el, update: page.update, focus: page.focus };
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

/// Another account of the person's, signed in on the side, and what merging
/// it would move: { kind, token, email, password, preview }.
let merging = null;
/// What the last merge brought, for the line on coming back: { contacts, devices, linked }.
let merged = null;

const KINDS = ['google', 'apple', 'password'];
const BADGES = { google: 'google', apple: 'apple', password: 'mail' };
const kindName = (kind) => (kind === 'password' ? tr('Почта и пароль') : kind === 'google' ? 'Google' : 'Apple');

/// "Google и Apple", for "Вход через …".
function waysText(ids) {
  const names = { 'google.com': 'Google', 'apple.com': 'Apple', password: tr('почту') };
  const list = [...new Set(ids)].filter((id) => names[id]).map((id) => names[id]);
  return list.length ? new Intl.ListFormat(LANG, { type: 'conjunction' }).format(list) : '';
}

const devicesCount = (n) => trn('{n} устройство', n);
const badge = (kind) => h('span', { class: 'avatar method' }, icon(BADGES[kind], 18));

/// A password field with the eye on the right, to see what was typed.
function passwordField(input) {
  const eye = h('button', { class: 'eye', type: 'button' });
  const sync = () => {
    const shown = input.type === 'text';
    eye.replaceChildren(icon(shown ? 'eyeOff' : 'eye', 18));
    eye.title = shown ? tr('Скрыть пароль') : tr('Показать пароль');
    eye.setAttribute('aria-label', eye.title);
    eye.setAttribute('aria-pressed', String(shown));
  };
  eye.addEventListener('click', () => {
    input.type = input.type === 'password' ? 'text' : 'password';
    sync();
    input.focus();
  });
  sync();
  return h('div', { class: 'field password' }, input, eye);
}

/// «Способы входа»: Google, Apple, a password; added and removed here. A way
/// in that is another account's leads to merging that account into this one.
function methodsSection() {
  let busy = null;
  let removing = null;
  let withEmail = false;
  let error = null;

  const address = h('input', { type: 'email', inputmode: 'email', autocapitalize: 'off', spellcheck: 'false', autocomplete: 'username', placeholder: 'you@example.com' });
  const password = h('input', { type: 'password', autocomplete: 'new-password', placeholder: tr('Новый пароль') });
  const addressBox = slot();
  const formNote = slot('div', { class: 'note' });
  const submit = h('button', { class: 'pill strong', onclick: () => add('password') }, tr('Добавить'));
  const form = h('div', { class: 'col method-form', style: { gap: '8px' } },
    addressBox, passwordField(password),
    h('div', { class: 'row', style: { gap: '8px' } },
      submit,
      h('button', { class: 'pill', onclick: () => { withEmail = false; error = null; password.value = ''; update(); } }, tr('Отмена'))));
  password.addEventListener('keydown', (e) => e.key === 'Enter' && add('password'));
  const rows = slot();
  const errorBox = slot();
  const el = h('div', { class: 'col', id: 'signin', style: { gap: '8px' } },
    caption(tr('Способы входа')),
    h('div', { class: 'card col' }, rows, form),
    errorBox,
    note(tr('Входи любым из них — книга одна и та же.')));

  const emailFor = () => m.email || address.value.trim();

  async function add(kind) {
    if (busy) return;
    if (kind === 'password' && !withEmail) {
      withEmail = true;
      error = null;
      update();
      (m.email ? password : address).focus();
      return;
    }
    const email = emailFor();
    if (kind === 'password') {
      if (!email.includes('@')) return show(tr('Проверь адрес почты'));
      if (password.value.length < 8) return show(tr('Пароль нужен не короче 8 символов'));
    }
    busy = kind;
    error = null;
    update();
    try {
      const other = await auth.addMethod(kind, email, password.value);
      if (other) {
        const preview = await api.merge(other.token, false);
        merging = { kind, token: other.token, email: other.email, address: email, password: password.value, preview };
        busy = null;
        go('#/settings/merge');
        return;
      }
      withEmail = false;
      password.value = '';
      accountChanged();
    } catch (e) {
      error = e instanceof api.ApiError ? api.apiMessage(e) : auth.addMessage(e);
    }
    busy = null;
    update();
  }

  async function remove(id) {
    busy = id;
    error = null;
    update();
    try {
      await auth.removeMethod(id);
      removing = null;
      accountChanged();
    } catch (e) {
      error = auth.addMessage(e);
    }
    busy = null;
    update();
  }

  function show(text) {
    error = text;
    update();
  }

  function update() {
    const ways = auth.methods();
    rows.fill(KINDS.map((kind, i) => {
      const id = auth.PROVIDERS[kind];
      const way = ways.find((w) => w.id === id);
      const sub = way
        ? (auth.hiddenByApple(way.email) ? tr('Почту скрыл Apple') : way.email)
        : kind === 'password' && withEmail ? (m.email ? tr('Придумай пароль для {email}', { email: m.email }) : tr('Почта и пароль для входа')) : '';
      let action = null;
      if (way && ways.length > 1) {
        action = removing === id
          ? [h('button', { class: 'pill', disabled: !!busy, onclick: () => { removing = null; update(); } }, tr('Нет')),
            h('button', { class: 'pill danger-fill', disabled: !!busy, onclick: () => remove(id) }, tr('Убрать'))]
          : h('button', { class: 'small-button quiet', disabled: !!busy, onclick: () => { removing = id; update(); } }, tr('Убрать'));
      } else if (!way && !(kind === 'password' && withEmail)) {
        action = h('button', { class: 'small-button', disabled: !!busy, onclick: () => add(kind) }, busy === kind ? '…' : tr('Добавить'));
      }
      return [i > 0 && h('hr'),
        h('div', { class: 'row method-row' },
          badge(kind),
          h('div', { class: 'col grow', style: { minWidth: '0' } },
            h('span', null, kindName(kind)),
            sub && h('span', { class: 'note ellipsis' }, sub)),
          action)];
    }));
    form.hidden = !withEmail || ways.some((w) => w.id === 'password');
    addressBox.fill(!m.email && address);
    submit.disabled = busy === 'password';
    submit.textContent = busy === 'password' ? tr('Добавляем…') : tr('Добавить');
    errorBox.fill(error && h('div', { class: 'small danger', role: 'alert' }, error));
  }
  update();
  return { el, update };
}

function accountTab(scrollToMethods = false) {
  let confirm = false;
  let busy = false;
  let error = null;
  // Back from the merge screen: the other account isn't needed any more.
  if (merging) {
    merging = null;
    auth.forgetOther();
  }
  const done = merged;
  merged = null;

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

  const accountCard = slot('div', { class: 'row card', style: { gap: '12px', padding: '12px' } });
  const ways = methodsSection();
  const invite = slot('div', { class: 'col', style: { gap: '6px' } });
  const removal = slot('div', { class: 'col', style: { gap: '8px' } });
  const box = h('div', { class: 'col', style: { gap: '18px' } },
    accountCard,
    done && mergedLine(done),
    ways.el,
    invite,
    removal,
    h('div', { class: 'row', style: { gap: '10px' } },
      h('span', { class: 'grow' }, tr('Язык')),
      language),
    h('div', { class: 'note center' }, `Love Around web ${VERSION}`));

  function update() {
    const methods = auth.methods().map((w) => w.id);
    accountCard.fill(
      avatar(m.email || '♥', palette(settings.myColor), 40),
      h('div', { class: 'col grow', style: { minWidth: '0' } },
        h('span', { class: 'ellipsis strong' }, m.email || 'Apple ID'),
        h('span', { class: 'note' }, methods.length ? tr('Вход через {ways}', { ways: waysText(methods) }) : tr('Книга хранится в аккаунте'))),
      h('button', { class: 'small-button', onclick: () => signOut() }, tr('Выйти')));
    ways.update();
    invite.fill(
      inviteRow(),
      note(tr('Отправь его тем, кто хочет нажимать, когда думает о тебе.')));
    removal.fill(
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
      error && h('div', { class: 'small danger' }, error));
  }
  update();
  return { el: box, update, focus: scrollToMethods ? () => ways.el.scrollIntoView({ block: 'start' }) : null };
}

/// "Аккаунты объединены: в книге +2 человека, устройств +1."
function mergedLine({ contacts, devices, linked }) {
  const people = '+' + peopleCount(contacts);
  const text = contacts && devices ? tr('Аккаунты объединены: в книге {people}, устройств +{devices}.', { people, devices })
    : contacts ? tr('Аккаунты объединены: в книге {people}.', { people })
      : devices ? tr('Аккаунты объединены: устройств +{devices}.', { devices })
        : tr('Аккаунты объединены.');
  const line = banner('check', linked ? text : `${text} ${tr('Способ входа того аккаунта не перенёсся: добавь его здесь ещё раз.')}`);
  line.classList.add('ok');
  return line;
}

// ---- Объединить аккаунты? ---------------------------------------------------------

/// What merging the other account into this one does, before it is done.
function mergeScreen() {
  const { kind, email, preview: p } = merging;
  let busy = false;
  let error = null;
  const box = slot('div', { class: 'col', style: { gap: '16px' } });
  const back = () => go('#/settings/account', true);
  const el = h('div', { class: 'page settings col', style: { gap: '16px' } },
    h('div', { class: 'row', style: { gap: '6px' } },
      iconButton('chevronLeft', tr('Назад'), back),
      h('h1', { class: 'title grow' }, tr('Объединить аккаунты?'))),
    box);

  async function confirm() {
    const { token, address, password } = merging;
    busy = true;
    error = null;
    update();
    try {
      const result = await api.merge(token, true);
      await auth.afterMerge(kind, address, password);
      merged = result;
      accountChanged();
      reload();
      back();
      return;
    } catch (e) {
      error = e instanceof api.ApiError && e.status === 403
        ? tr('Прошло слишком много времени. Вернись и добавь способ входа ещё раз.')
        : e instanceof api.ApiError ? api.apiMessage(e) : tr('Не получилось, попробуй ещё раз');
    }
    busy = false;
    update();
  }

  const check = (text) => h('div', { class: 'row', style: { gap: '8px', alignItems: 'flex-start' } },
    h('span', { class: 'ok row', style: { paddingTop: '1px' } }, icon('check', 16)), h('span', null, text));
  const intro = kind === 'apple' ? tr('Этим Apple ID уже входят в другой аккаунт. Можно перенести всё из него сюда.')
    : kind === 'google' ? tr('Этим аккаунтом Google уже входят в другой аккаунт. Можно перенести всё из него сюда.')
      : tr('С этой почтой уже есть другой аккаунт. Можно перенести всё из него сюда.');
  const ways = waysText([...(p.ways || []), auth.PROVIDERS[kind]]);
  const telegram = p.telegram_there
    ? (p.telegram_here ? tr('Чат с ботом в Telegram останется от этого аккаунта.') : tr('Чат с ботом в Telegram перейдёт сюда.'))
    : '';

  function update() {
    box.fill(
      h('div', { class: 'merge-intro' }, intro),
      h('div', { class: 'card col merge-card' },
        h('div', { class: 'row method-row' },
          badge(kind),
          h('div', { class: 'col grow', style: { minWidth: '0' } },
            h('span', { class: 'strong ellipsis' }, email || (kind === 'apple' ? 'Apple ID' : kindName(kind))),
            h('span', { class: 'note' }, [peopleCount(p.contacts), p.devices > 0 && devicesCount(p.devices)].filter(Boolean).join(' · '))),
          h('span', { class: 'note' }, tr('удалится'))),
        h('div', { class: 'row note merge-arrow' }, h('span', { class: 'arrow' }, '↓'), h('span', null, tr('всё переедет сюда'))),
        h('div', { class: 'row method-row' },
          avatar(m.email || '♥', palette(settings.myColor), 34),
          h('div', { class: 'col grow', style: { minWidth: '0' } },
            h('span', { class: 'strong ellipsis' }, m.email || 'Apple ID'),
            h('span', { class: 'note' }, `${peopleCount(p.here)} · ${tr('этот, остаётся')}`)))),
      h('div', { class: 'col merge-checks' },
        p.contacts > 0 && check(tr('Люди из того аккаунта появятся в твоей книге. Кто есть в обоих — один раз.')),
        p.devices > 0 && check(tr('Игрушки и устройства перейдут сюда и продолжат работать.')),
        ways && check(tr('Входить можно будет через {ways}.', { ways }))),
      p.invite_url && h('div', { class: 'banner merge-warning' }, icon('alert', 16),
        h('span', null, ...tr('Love ID того аккаунта, {link}, перестанет работать. Кто добавил тебя по нему, не достучится, пока не добавит заново по твоей ссылке.')
          .split('{link}').flatMap((part, i) => (i ? [h('b', null, p.invite_url.replace(/^https?:\/\//, '')), part] : [part])))),
      note([tr('Приложения, где открыт тот аккаунт, попросят войти заново.'), telegram].filter(Boolean).join(' ')),
      h('div', { class: 'col', style: { gap: '8px', marginTop: '4px' } },
        h('button', { class: 'primary', disabled: busy, onclick: confirm }, busy ? tr('Объединяем…') : tr('Объединить')),
        h('button', { class: 'secondary', disabled: busy, onclick: back }, tr('Не объединять'))),
      error && h('div', { class: 'small danger', role: 'alert' }, error));
  }
  update();
  return { el, update };
}
