// Places in the app live in the address's hash, so the browser's back
// button works and a reload comes back to the same screen:
//   #/            who you are thinking of
//   #/add[/code]  someone new, by their invite link
//   #/book[/id]   the book, and one person in it
//   #/settings/<tab>   signal, when, devices, account (signin: its ways in; merge)
//   #/pair        a device by its code (the code itself never stays here: pair.js)

export function route() {
  const parts = location.hash.replace(/^#\/?/, '').split('/').filter(Boolean).map(decodeURIComponent);
  switch (parts[0]) {
    case 'add':
      return { name: 'add', invite: parts[1] ?? null };
    case 'book':
      return { name: 'book', id: parts[1] ?? null, adding: parts[1] === 'new' };
    case 'settings':
      // signin: the account's ways in (the apps link there); merge: two accounts into one.
      return { name: 'settings', tab: ['signal', 'when', 'devices', 'account', 'signin', 'merge'].includes(parts[1]) ? parts[1] : 'signal' };
    case 'pair':
      return { name: 'pair' };
    default:
      return { name: 'home' };
  }
}

/// To another place; `replace` keeps the back button from coming back here.
export function go(hash, replace = false) {
  if (location.hash === hash) return;
  if (replace) {
    history.replaceState(null, '', hash);
    dispatchEvent(new HashChangeEvent('hashchange'));
  } else {
    location.hash = hash;
  }
}
