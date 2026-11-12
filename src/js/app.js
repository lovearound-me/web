// Love Around in a browser tab: sends hearts like the apps do and receives
// them while the tab is open. Starts Firebase, picks the screen for the
// address, and redraws it when anything changes.

import { h, icon, darkQuery, inviteId } from './lib.js';
import { tr } from './i18n.js';
import { settings, reload as reloadSettings, STORAGE_KEY } from './settings.js';
import { m, subscribe, changed, sessionChanged, settingsReloaded } from './model.js';
import * as auth from './auth.js';
import { wakeSound } from './overlay.js';
import { banner, iconButton, contactForm } from './ui.js';
import { route, go } from './router.js';
import { homeScreen } from './home.js';
import { boardScreen, WIDE } from './board.js';
import { bookScreen } from './book.js';
import { settingsScreen } from './settings-page.js';
import { signInScreen } from './signin.js';

const app = document.getElementById('app');
const TITLE = 'Love Around';
const favicon = document.getElementById('favicon');

// ---- an invite link opened here --------------------------------------------------

/// app.lovearound.me/i/<code> or ?add=<code>: the form for adding them,
/// right after signing in if needed (the hash survives it).
(function takeInvite() {
  const params = new URLSearchParams(location.search);
  const code = inviteId(params.get('add') || '') ?? (location.pathname.startsWith('/i/') ? inviteId(location.pathname) : null);
  if (code) history.replaceState(null, '', `/#/add/${encodeURIComponent(code)}`);
  else if (location.pathname !== '/' && !location.pathname.endsWith('/index.html')) history.replaceState(null, '', '/' + location.hash);
})();

// ---- screens -------------------------------------------------------------------

let screen = null; // { key, el, update, busy?, leave?, focus? }
let wanted = false;

function keyOf(r) {
  if (!m.ready) return 'loading';
  if (m.sdkFailed) return 'offline';
  if (!m.signedIn) return 'signin';
  if (r.name === 'add') return `add/${r.invite ?? ''}`;
  if (r.name === 'book') return `book/${r.adding ? 'new' : r.id ?? ''}`;
  if (r.name === 'settings') return `settings/${r.tab}`;
  return WIDE.matches ? 'board' : 'home';
}

function build(key, r) {
  if (key === 'loading') return { el: h('div', { class: 'page loading' }, h('div', { class: 'hello-heart pulse' }, icon('heart', 30))), update() {} };
  if (key === 'offline') {
    return {
      el: h('div', { class: 'page signin col center', style: { gap: '12px', alignItems: 'center' } },
        h('div', { class: 'hello-heart' }, icon('heart', 30)),
        h('div', { class: 'muted' }, tr('Нет связи, проверь интернет'))),
      update() {},
    };
  }
  if (key === 'signin') return signInScreen();
  if (r.name === 'add') {
    const form = contactForm({ invite: r.invite, onBack: () => go('#/', true), onAdded: () => go('#/', true) });
    return { el: h('div', { class: 'page add' }, form.el), update() {}, focus: form.focus };
  }
  if (r.name === 'book') return bookScreen(r);
  if (r.name === 'settings') return settingsScreen(r);
  return key === 'board' ? boardScreen() : homeScreen();
}

/// The shell around a signed-in screen: the heart that leads home, the
/// book and the settings, and the line when the server can't be reached.
const top = h('header', { class: 'top' });
const offlineLine = h('div', { class: 'offline-line' });
const main = h('main', { class: 'main' });
app.append(top, offlineLine, main);

function drawTop(r) {
  if (!m.signedIn) {
    top.hidden = true;
    return;
  }
  top.hidden = false;
  top.replaceChildren(
    h('a', { class: 'brand', href: '#/', 'aria-label': TITLE }, h('span', { class: 'brand-heart' }, icon('heart')), h('span', null, TITLE)),
    h('span', { class: 'grow' }),
    h('nav', { class: 'row', style: { gap: '2px' } },
      navButton('book', tr('Книга'), '#/book', r.name === 'book'),
      navButton('gear', tr('Настройки'), '#/settings/signal', r.name === 'settings')));
}

function navButton(name, help, hash, on) {
  const b = iconButton(name, help, () => go(hash));
  if (on) b.classList.add('on');
  return b;
}

function render() {
  wanted = false;
  const r = route();
  const key = keyOf(r);
  if (screen && screen.key === key) {
    // A drag in progress keeps its rows; the redraw comes after it.
    if (screen.busy?.()) {
      setTimeout(schedule, 250);
      return;
    }
    screen.update();
  } else {
    screen?.leave?.();
    const next = build(key, r);
    next.key = key;
    screen = next;
    main.replaceChildren(next.el);
    if (key !== 'loading') scrollTo(0, 0);
    next.focus?.();
  }
  // The board is wider than the other screens: so is the header above it.
  app.classList.toggle('wide', key === 'board');
  drawTop(r);
  offlineLine.replaceChildren();
  if (m.signedIn && m.offline) offlineLine.append(banner('wifiOff', tr('Нет связи с сервером, сигналы сейчас не приходят. Переподключаемся…')));
  markTab();
}

function schedule() {
  if (wanted) return;
  wanted = true;
  queueMicrotask(render);
}

// A signal that came while the tab was hidden: a heart in the tab's title
// and on its icon, until the tab is seen again.
let marked = null;
function markTab() {
  if (marked === m.pending) return;
  marked = m.pending;
  document.title = m.pending ? `♥ ${TITLE}` : TITLE;
  favicon.href = m.pending ? '/heart-new.svg' : '/heart.svg';
}

subscribe(schedule);
addEventListener('hashchange', schedule);
darkQuery.addEventListener('change', schedule);
WIDE.addEventListener('change', schedule);

// The ring of "Кому-нибудь на свете" fills over the hour, a pause runs out.
setInterval(() => {
  if (document.visibilityState === 'visible' && m.signedIn) schedule();
}, 10_000);
document.addEventListener('visibilitychange', () => document.visibilityState === 'visible' && schedule());

// Another tab of the app changed the settings.
addEventListener('storage', (e) => {
  if (e.key !== STORAGE_KEY) return;
  const language = settings.language;
  reloadSettings();
  if (settings.language !== language) location.reload();
  else settingsReloaded();
});

// A browser plays sound only after the person has touched the page.
addEventListener('pointerdown', wakeSound, { once: true, capture: true });
addEventListener('keydown', wakeSound, { once: true, capture: true });

addEventListener('keydown', (e) => {
  if (e.key !== 'Escape' || !m.signedIn) return;
  const r = route();
  if (r.name === 'add' || r.name === 'settings') go('#/');
  else if (r.name === 'book' && (r.id || r.adding)) go('#/book');
});

render();

const loaded = await auth.init((user) => sessionChanged(user));
if (!loaded) {
  m.ready = true;
  m.sdkFailed = true;
  changed();
  // Back online: start over.
  addEventListener('online', () => location.reload(), { once: true });
}

