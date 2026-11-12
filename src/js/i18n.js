// The page's language and its dictionary (i18n/<lang>.json, keyed by the
// Russian text, as in the desktop apps). build.py fills what a language
// lacks with English, so a lookup only falls back to the Russian key itself.

import { settings } from './settings.js';

export const LANGUAGES = [['en', 'English'], ['es', 'Español'], ['pt', 'Português'], ['de', 'Deutsch'], ['fr', 'Français'],
  ['it', 'Italiano'], ['pl', 'Polski'], ['tr', 'Türkçe'], ['uk', 'Українська'], ['ru', 'Русский'],
  ['id', 'Bahasa Indonesia'], ['ko', '한국어'], ['zh', '中文']];
const CODES = LANGUAGES.map(([code]) => code);

/// The one picked in Settings, else the browser's first language the app has, else English.
function choose() {
  if (CODES.includes(settings.language)) return settings.language;
  for (const tag of navigator.languages || [navigator.language || '']) {
    const code = tag.toLowerCase().split('-')[0];
    if (CODES.includes(code)) return code;
  }
  return 'en';
}

export const LANG = choose();
document.documentElement.lang = LANG;

let table = {};
try {
  const response = await fetch(`/i18n/${LANG}.json`);
  if (response.ok) table = await response.json();
} catch {
  // Offline on the first load: the Russian keys are still words.
}

const plurals = new Intl.PluralRules(LANG);
const fill = (text, args) => text.replace(/\{(\w+)\}/g, (all, key) => (args && key in args ? String(args[key]) : all));

/// tr('Пауза до {time}', { time: '08:00' })
export function tr(text, args) {
  const value = table[text];
  return fill(typeof value === 'string' ? value : text, args);
}

/// trn('{n} человек', 5): the form for `n` by the plural rules of the language.
export function trn(text, n, args) {
  const value = table[text];
  let form = text;
  if (value && typeof value === 'object') form = value[plurals.select(n)] ?? value.other ?? value.many ?? text;
  return fill(form, { ...args, n });
}
