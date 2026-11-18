// Signing in: Apple, Google, or an email and a password (which makes the
// account if there is none yet). Ported from the Windows app's sign-in screen; here
// Firebase runs right on the page, so there is no trip to another tab.
//
// One touch: when Apple or Google meets an account made another way with the
// same email, the screen asks for the old way, offering every way but the one
// refused, and auth.js adds the refused one right after (see `pending` there).

import { h, icon } from './lib.js';
import { tr } from './i18n.js';
import { m, accountChanged } from './model.js';
import * as auth from './auth.js';
import { slot } from './ui.js';
import { route } from './router.js';

export const WAY_NAMES = { apple: 'Apple', google: 'Google' };

export function signInScreen() {
  let withEmail = false;
  let busy = false;
  let message = null;
  let notice = null;

  const email = h('input', { type: 'email', inputmode: 'email', autocapitalize: 'off', spellcheck: 'false', autocomplete: 'username', placeholder: 'you@example.com' });
  const password = h('input', { type: 'password', autocomplete: 'current-password', placeholder: tr('Не меньше 8 символов') });
  const body = slot('div', { class: 'col', style: { gap: '10px' } });
  const noticeBox = slot();

  const clear = () => {
    message = null;
    notice = null;
  };

  async function submit() {
    const address = email.value.trim();
    if (!address) return show(tr('Введи почту'));
    if (!address.includes('@')) return show(tr('Проверь адрес почты'));
    if (password.value.length < 8) return show(tr('Пароль нужен не короче 8 символов'));
    busy = true;
    clear();
    update();
    try {
      await auth.signInWithEmail(address, password.value);
      password.value = '';
      accountChanged();
    } catch (e) {
      message = auth.authMessage(e);
    }
    busy = false;
    update();
  }

  async function reset() {
    const address = email.value.trim();
    if (!address) return show(tr('Сначала введи почту'));
    clear();
    try {
      await auth.resetPassword(address);
      notice = tr('Письмо для нового пароля отправлено');
    } catch (e) {
      message = auth.authMessage(e);
    }
    update();
  }

  async function withProvider(signIn) {
    clear();
    busy = true;
    update();
    try {
      await signIn();
      accountChanged();
    } catch (e) {
      // Refused for an account made another way: the one-touch view says it.
      message = e?.code === 'auth/account-exists-with-different-credential' && auth.pendingWay() ? null : auth.authMessage(e);
    }
    busy = false;
    update();
  }

  function show(text) {
    message = text;
    notice = null;
    update();
  }

  const form = h('form', { class: 'col', style: { gap: '10px' }, novalidate: true },
    h('label', { class: 'field' }, h('span', { class: 'caption' }, tr('Почта')), email),
    h('label', { class: 'field' }, h('span', { class: 'caption' }, tr('Пароль')), password));
  const submitButton = h('button', { class: 'primary', type: 'submit' });
  const formError = slot();
  form.append(submitButton, formError,
    h('div', { class: 'row', style: { fontSize: '13px' } },
      h('button', { type: 'button', class: 'muted', onclick: () => { withEmail = false; clear(); update(); } }, tr('← Назад')),
      h('span', { class: 'grow' }),
      h('button', { type: 'button', class: 'link', onclick: reset }, tr('Забыли пароль?'))));
  form.addEventListener('submit', (e) => {
    e.preventDefault();
    submit();
  });

  const appleButton = h('button', { class: 'primary apple', onclick: () => withProvider(auth.signInWithApple) },
    icon('apple', 17), tr('Войти через Apple'));
  const googleButton = h('button', { class: 'secondary', onclick: () => withProvider(auth.signInWithGoogle) },
    icon('google', 17), tr('Войти через Google'));
  const emailButton = h('button', { class: 'secondary', onclick: () => { withEmail = true; clear(); update(); email.focus(); } },
    icon('mail', 17), tr('Войти по почте'));
  const choiceError = slot();
  const backToAll = h('button', { type: 'button', class: 'muted small', onclick: () => { auth.dropPending(); clear(); update(); } }, tr('← Все способы'));
  const choice = h('div', { class: 'col', style: { gap: '8px' } }, appleButton, googleButton, emailButton, choiceError, backToAll);

  const error = () => {
    const text = message ?? m.problem;
    return text && h('div', { class: 'error', role: 'alert' }, icon('alert', 14), h('span', null, text));
  };

  const heading = h('h1', { class: 'hello' });
  const lead = h('div', { class: 'muted' });
  let shownWay = null;

  function update() {
    // The way refused for an existing account, waiting for the old way.
    const way = auth.pendingWay();
    if (way?.kind !== shownWay) {
      shownWay = way?.kind ?? null;
      if (way?.email && !email.value) email.value = way.email;
    }
    heading.textContent = way ? tr('Эта почта уже есть') : tr('Привет!');
    lead.textContent = way
      ? tr('Войди как раньше, и {way} добавится.', { way: WAY_NAMES[way.kind] })
      : route().name === 'pair'
      ? tr('Войди, чтобы подключить устройство.')
      : tr('Думаешь о ком-то? Нажми, и он почувствует, что его любят и он нужен. А от кого, не узнает.');
    appleButton.hidden = way?.kind === 'apple';
    googleButton.hidden = way?.kind === 'google';
    backToAll.hidden = !way;
    submitButton.disabled = busy;
    submitButton.textContent = busy ? tr('Входим…') : tr('Войти или создать аккаунт');
    appleButton.disabled = googleButton.disabled = busy;
    formError.fill(withEmail && error());
    choiceError.fill(!withEmail && error());
    body.fill(withEmail ? form : choice);
    noticeBox.fill(notice && h('div', { class: 'notice center small' }, notice));
  }

  const el = h('div', { class: 'page signin col', style: { gap: '16px' } },
    h('div', { class: 'col center', style: { gap: '10px', alignItems: 'center', paddingTop: '8px' } },
      h('div', { class: 'hello-heart' }, icon('heart', 30)),
      heading,
      lead),
    body,
    noticeBox);

  update();
  return { el, update };
}
