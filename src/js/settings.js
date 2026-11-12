// What stays in this browser, as the desktop apps keep it on the computer:
// colors, how a signal looks, pause, language. The server knows only the
// contacts and their names.

const KEY = 'lovearound.settings';
export const FOREVER = 8.64e15;

const reducedMotion = (() => {
  try {
    return matchMedia('(prefers-reduced-motion: reduce)').matches;
  } catch {
    return false;
  }
})();

const DEFAULTS = {
  myColor: 1,
  sound: false,
  calm: reducedMotion,
  emojiCount: 40,
  minGap: 1,
  acceptAnyone: true,
  anyoneSentAt: null,
  contactColors: {},
  lastSent: {},
  pausedUntil: null,
  language: '',
  /// The note that the browser receives only while the tab is open, closed once.
  webNoteSeen: false,
};

function load() {
  try {
    const saved = JSON.parse(localStorage.getItem(KEY) || '{}');
    return { ...DEFAULTS, ...(saved && typeof saved === 'object' ? saved : {}) };
  } catch {
    return { ...DEFAULTS };
  }
}

export const settings = load();

export function save() {
  try {
    localStorage.setItem(KEY, JSON.stringify(settings));
  } catch {
    // Private mode or storage off: the settings last as long as the tab.
  }
}

/// Another tab of the app changed them: take its values.
export function reload() {
  Object.assign(settings, load());
}

export const STORAGE_KEY = KEY;
