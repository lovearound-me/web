// What the page knows and does: the account, the book, sending and
// receiving. Ported from the Windows app's model.rs; the screens read `m`
// and call these, and every change ends with changed().

import * as api from './api.js';
import * as auth from './auth.js';
import * as overlay from './overlay.js';
import { Stream } from './stream.js';
import { settings, save, FOREVER } from './settings.js';
import { tr } from './i18n.js';
import { colorFor, palette, closeContacts, anyoneWait, STAR_COLOR } from './lib.js';

const DEFAULT_EMOJI_COUNT = 40;

export const m = {
  /// Firebase has said whether someone is signed in.
  ready: false,
  /// The sign-in SDK couldn't be loaded (offline on the very first visit).
  sdkFailed: false,
  signedIn: false,
  email: null,
  inviteUrl: null,
  contacts: [],
  /// The book came from the server at least once since signing in.
  loaded: false,
  /// The contact just sent to, for "Улетело ♥".
  sent: null,
  problem: null,
  /// No socket for 5 s while signed in.
  offline: false,
  anyoneSending: false,
  /// { name, token } right after connecting a device: the token is shown once.
  createdDevice: null,
  /// A signal came while the tab was hidden; it plays on coming back.
  pending: false,
};

const listeners = new Set();
export const subscribe = (fn) => listeners.add(fn);
export function changed() {
  for (const fn of listeners) fn();
}

const set = (fields) => {
  Object.assign(m, fields);
  changed();
};

export const isPaused = () => settings.pausedUntil != null && settings.pausedUntil > Date.now();

const pad = (n) => String(n).padStart(2, '0');

export function pauseText() {
  if (!isPaused()) return '';
  const until = settings.pausedUntil;
  if (until >= FOREVER) return tr('Пауза, пока не снимешь');
  const at = new Date(until);
  const time = `${pad(at.getHours())}:${pad(at.getMinutes())}`;
  return at.toDateString() === new Date().toDateString() ? tr('Пауза до {time}', { time }) : tr('Пауза до завтра, {time}', { time });
}

// ---- the session -------------------------------------------------------------

const stream = new Stream({
  online: (up) => connectionChanged(up),
  sync: () => reload(),
  signal: () => receive(),
  authLost: () => signOut(tr('Нужно войти заново')),
});

let offlineGen = 0;
function connectionChanged(up) {
  offlineGen++;
  if (up) {
    if (m.offline) set({ offline: false });
    return;
  }
  const gen = offlineGen;
  setTimeout(() => {
    if (gen === offlineGen && m.signedIn && !m.offline) set({ offline: true });
  }, 5000);
}

/// Firebase's word on who is signed in: on load, after signing in or out.
export function sessionChanged(user) {
  m.ready = true;
  if (user) {
    const fresh = !m.signedIn;
    m.signedIn = true;
    m.email = user.email || null;
    if (fresh) {
      m.problem = null;
      connectionChanged(false);
      stream.start(settings.acceptAnyone);
      reload();
    }
  } else if (m.signedIn) {
    clearSession();
  }
  changed();
}

function clearSession() {
  stream.stop();
  offlineGen++;
  Object.assign(m, {
    signedIn: false, email: null, inviteUrl: null, contacts: [], loaded: false,
    offline: false, createdDevice: null, sent: null, pending: false, anyoneSending: false,
  });
}

export async function signOut(problem = null) {
  clearSession();
  m.problem = problem;
  changed();
  await auth.signOut().catch(() => {});
}

export async function deleteAccount() {
  await api.deleteMe();
  settings.contactColors = {};
  settings.lastSent = {};
  save();
  await signOut();
}

/// Whatever ended with 401: the session is over.
function failed(e, problem) {
  if (e instanceof api.ApiError && e.endsSession) {
    signOut(tr('Нужно войти заново'));
    return true;
  }
  if (problem) set({ problem });
  return false;
}

const normalize = (list) => list
  .map((c) => ({ id: c.id, label: c.label, position: c.position ?? 0, close: !!c.close }))
  .sort((a, b) => a.position - b.position);

let reloading = null;
let reloadAgain = false;

/// The book and the own link, from the server: on signing in, on every
/// socket "ready" and on a "sync" hint.
export function reload() {
  if (reloading) {
    reloadAgain = true;
    return reloading;
  }
  reloading = (async () => {
    do {
      reloadAgain = false;
      try {
        const [me, list] = await Promise.all([api.me(), api.contacts()]);
        if (!m.signedIn) return;
        m.inviteUrl = me.invite_url;
        // A reorder not saved yet would jump back: its own save brings it.
        if (!positionsTimer) m.contacts = normalize(list);
        m.loaded = true;
        m.problem = null;
        changed();
      } catch (e) {
        if (!m.signedIn || failed(e, tr('Нет связи с сервером. Попробуем ещё раз чуть позже.'))) return;
      }
    } while (reloadAgain);
  })().finally(() => {
    reloading = null;
  });
  return reloading;
}

export function setAcceptAnyone(on) {
  settings.acceptAnyone = on;
  save();
  stream.setAnyone(on);
  changed();
}

/// Settings changed in another tab of the app.
export function settingsReloaded() {
  stream.setAnyone(settings.acceptAnyone);
  changed();
}

// ---- signals -------------------------------------------------------------------

let sentGen = 0;

export function send(contact) {
  const color = colorFor(m, contact).ring;
  const gen = ++sentGen;
  settings.lastSent[contact.id] = Date.now();
  save();
  set({ sent: contact.id });
  setTimeout(() => sentGen === gen && set({ sent: null }), 2000);
  // The sender sees the glow too, in the contact's color: silent, and even on pause.
  overlay.play({ color, emoji: 'warm', count: settings.emojiCount, calm: settings.calm, sound: false });
  api.signal(contact.id).then(
    () => m.problem && set({ problem: null }),
    (e) => {
      if (failed(e)) return;
      if (sentGen === gen) m.sent = null;
      set({ problem: tr('Не улетело, проверь интернет') });
    },
  );
}

/// "Кому-нибудь на свете": one random person online who takes them. The
/// server accepts it even with nobody online, so "Улетело" is all the
/// sender ever learns.
export async function sendToAnyone() {
  if (anyoneWait() != null || m.anyoneSending) return;
  set({ anyoneSending: true });
  try {
    await api.signalAnyone();
    settings.anyoneSentAt = Date.now();
    save();
    m.problem = null;
    overlay.play({ color: STAR_COLOR, emoji: 'stars', count: DEFAULT_EMOJI_COUNT, calm: settings.calm, sound: false });
  } catch (e) {
    if (!failed(e)) {
      if (e instanceof api.ApiError && e.status === 429) {
        // Sent from another device this hour, at a time not known here:
        // wait a whole hour from now, a little longer than needed.
        settings.anyoneSentAt = Date.now() - 120_000;
        save();
        m.problem = null;
      } else {
        m.problem = tr('Не улетело, проверь интернет');
      }
    }
  }
  set({ anyoneSending: false });
}

let lastShown = 0;

function receive() {
  if (isPaused()) return;
  // Hidden: the glow would go unseen. It waits for the tab to come back,
  // marked in the tab's title; several of them are one.
  if (document.visibilityState === 'hidden') {
    if (!m.pending) set({ pending: true });
    return;
  }
  show();
}

function show() {
  // The server lets one signal per sender through each second; a rarer
  // glow is this browser's own choice, and the ones in between are not shown.
  if (lastShown && (Date.now() - lastShown) / 1000 < settings.minGap) return;
  lastShown = Date.now();
  playEffect();
}

/// The incoming-signal effect, also used by "Показать, как это выглядит".
export function playEffect() {
  overlay.play({ color: palette(settings.myColor).ring, emoji: 'warm', count: settings.emojiCount, calm: settings.calm, sound: settings.sound });
}

document.addEventListener('visibilitychange', () => {
  if (document.visibilityState !== 'visible' || !m.pending) return;
  set({ pending: false });
  // A moment to be back in the tab, then the signal it got while away.
  setTimeout(() => !isPaused() && show(), 600);
});

// ---- pause ---------------------------------------------------------------------

export function pause(length) {
  let until;
  if (length === 'hour') until = Date.now() + 3_600_000;
  else if (length === 'untilMorning') {
    const at = new Date();
    at.setHours(8, 0, 0, 0);
    if (at.getTime() <= Date.now()) at.setDate(at.getDate() + 1);
    until = at.getTime();
  } else until = FOREVER;
  settings.pausedUntil = until;
  save();
  changed();
}

export function resume() {
  settings.pausedUntil = null;
  save();
  changed();
}

// ---- contacts ------------------------------------------------------------------

export async function addContact(code, label, color, close) {
  const contact = await api.addContact(code, label, close);
  settings.contactColors[contact.id] = color;
  save();
  if (!m.contacts.some((c) => c.id === contact.id)) m.contacts.push(normalize([contact])[0]);
  changed();
  return contact.id;
}

let saving = Promise.resolve();
/// One change to the book at a time, in order.
const queue = (job) => (saving = saving.then(job, job));

export async function updateContact(id, label, color) {
  const current = m.contacts.find((c) => c.id === id);
  if (!current) throw new api.ApiError(404);
  if (label !== current.label) await queue(() => api.updateContact(id, { label }));
  settings.contactColors[id] = color;
  save();
  const now = m.contacts.find((c) => c.id === id);
  if (now) now.label = label;
  changed();
}

/// Into "Рядом" or out of it: shown at once, saved behind.
export function setClose(id, close) {
  const contact = m.contacts.find((c) => c.id === id);
  if (!contact || contact.close === close) return;
  contact.close = close;
  changed();
  queue(() => api.updateContact(id, { close })).catch((e) => {
    if (!failed(e, tr('Не получилось сохранить'))) reload();
  });
}

export async function remove(id) {
  await api.deleteContact(id);
  m.contacts = m.contacts.filter((c) => c.id !== id);
  delete settings.contactColors[id];
  delete settings.lastSent[id];
  save();
  changed();
}

/// Puts a close contact in the target's circle, the others shift.
export function moveCircle(id, target) {
  const close = closeContacts(m);
  const from = close.findIndex((c) => c.id === id);
  const to = close.findIndex((c) => c.id === target);
  if (from < 0 || to < 0 || from === to) return;
  const [person] = close.splice(from, 1);
  close.splice(to, 0, person);
  reorderClose(close);
}

/// A drag in the book: into "Рядом" at this place among the circles, or
/// out of it with null.
export function place(id, closeAt) {
  const contact = m.contacts.find((c) => c.id === id);
  if (!contact) return;
  if (closeAt == null) {
    setClose(id, false);
    return;
  }
  setClose(id, true);
  const close = closeContacts(m).filter((c) => c.id !== id);
  close.splice(Math.min(closeAt, close.length), 0, contact);
  reorderClose(close);
}

let positionsTimer = null;

/// Shown at once; saved a moment after the last change, so a drag across
/// several circles is one save.
function reorderClose(close) {
  // The close ones keep their slots in the whole list, in the new order.
  const slots = m.contacts.map((c, i) => (c.close ? i : -1)).filter((i) => i >= 0);
  slots.forEach((slot, k) => {
    m.contacts[slot] = close[k];
  });
  changed();
  clearTimeout(positionsTimer);
  positionsTimer = setTimeout(savePositions, 700);
}

function savePositions() {
  const updates = [];
  m.contacts.forEach((contact, index) => {
    if (contact.position !== index) {
      contact.position = index;
      updates.push([contact.id, index]);
    }
  });
  queue(async () => {
    try {
      for (const [id, position] of updates) await api.updateContact(id, { position });
    } catch (e) {
      if (!failed(e, tr('Не получилось сохранить порядок'))) reload();
    }
  }).finally(() => {
    positionsTimer = null;
  });
}

// ---- devices -------------------------------------------------------------------

export async function addDevice(name, capabilities) {
  const created = await api.addDevice(name, capabilities);
  set({ createdDevice: { name: created.device?.name ?? name, token: created.token } });
}

export const forgetCreatedDevice = () => set({ createdDevice: null });
