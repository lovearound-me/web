// Firebase Auth, right on the page: email+password, Apple and Google. The session
// stays in this browser (Firebase's local persistence) until signing out.

import { FIREBASE, FIREBASE_SDK } from './config.js';
import { LANG, tr } from './i18n.js';

let sdk = null;
let auth = null;
let firebase = null;

/// Loads the SDK; false if it couldn't be fetched (offline on the first visit).
export async function init(onChange) {
  try {
    const [app, fa] = await Promise.all([
      import(`${FIREBASE_SDK}/firebase-app.js`),
      import(`${FIREBASE_SDK}/firebase-auth.js`),
    ]);
    sdk = fa;
    firebase = app;
    auth = fa.getAuth(app.initializeApp(FIREBASE));
    auth.languageCode = LANG;
    fa.onAuthStateChanged(auth, onChange);
    // Back from an Apple or Google redirect (only when the popup was blocked).
    fa.getRedirectResult(auth).catch(() => {});
    return true;
  } catch {
    return false;
  }
}

export const user = () => auth?.currentUser ?? null;

/// The ID token, fresh enough; `force` asks Firebase for a new one.
export async function token(force = false) {
  const u = user();
  if (!u) throw Object.assign(new Error('signed out'), { code: 'signed-out' });
  return u.getIdToken(force);
}

/// Signs in, or makes the account if there is none for this email.
export async function signInWithEmail(email, password) {
  try {
    await sdk.signInWithEmailAndPassword(auth, email, password);
  } catch (e) {
    // With email enumeration protection on, a wrong password and a missing
    // account are the same "invalid credential": try making the account.
    if (e.code !== 'auth/user-not-found' && e.code !== 'auth/invalid-credential' && e.code !== 'auth/invalid-login-credentials') throw e;
    try {
      await sdk.createUserWithEmailAndPassword(auth, email, password);
    } catch (made) {
      // The account is there, so it was the password.
      throw made.code === 'auth/email-already-in-use' ? Object.assign(new Error(), { code: 'auth/wrong-password' }) : made;
    }
  }
}

function googleProvider() {
  const provider = new sdk.GoogleAuthProvider();
  provider.setCustomParameters({ prompt: 'select_account' });
  return provider;
}

/// Apple returns the email (or its relay address, if the person hides it) only
/// when asked; the name isn't needed.
function appleProvider() {
  const provider = new sdk.OAuthProvider('apple.com');
  provider.addScope('email');
  provider.setCustomParameters({ locale: LANG });
  return provider;
}

export const signInWithGoogle = () => withPopup(googleProvider());
export const signInWithApple = () => withPopup(appleProvider());

async function withPopup(provider) {
  try {
    await sdk.signInWithPopup(auth, provider);
  } catch (e) {
    if (e.code === 'auth/popup-blocked' || e.code === 'auth/operation-not-supported-in-this-environment') {
      await sdk.signInWithRedirect(auth, provider);
      return;
    }
    throw e;
  }
}

// ---- ways in ------------------------------------------------------------------

/// Firebase's names for them.
export const PROVIDERS = { google: 'google.com', apple: 'apple.com', password: 'password' };

/// The address Apple gives out when the person hides their own.
export const hiddenByApple = (email) => /@privaterelay\.appleid\.com$/i.test(email || '');

/// The account's ways in: [{ id: 'google.com' | 'apple.com' | 'password', email }].
export const methods = (u = user()) => (u?.providerData ?? [])
  .filter((p) => Object.values(PROVIDERS).includes(p.providerId))
  .map((p) => ({ id: p.providerId, email: p.email || '' }));

/// The address to show for the account: its own one, not Apple's relay if
/// there is another; null when Apple's relay is all there is.
export function shownEmail(u = user()) {
  if (!u) return null;
  const all = [u.email, ...methods(u).map((w) => w.email)].filter(Boolean);
  return all.find((e) => !hiddenByApple(e)) ?? null;
}

/// A second Firebase app, kept in memory only: the other account of a merge
/// signs in there, so this one stays signed in.
let side = null;
function sideAuth() {
  if (!side) {
    const app = firebase.getApps().find((a) => a.name === 'merge') ?? firebase.initializeApp(FIREBASE, 'merge');
    side = sdk.initializeAuth(app, { persistence: sdk.inMemoryPersistence, popupRedirectResolver: sdk.browserPopupRedirectResolver });
    side.languageCode = LANG;
  }
  return side;
}

export const forgetOther = () => (side ? sdk.signOut(side).catch(() => {}) : Promise.resolve());

const TAKEN = ['auth/credential-already-in-use', 'auth/email-already-in-use', 'auth/account-exists-with-different-credential'];

/// Adds a way in: 'google' or 'apple' in a popup, 'password' with these.
/// Resolves null when added. When the way in is another account's, that
/// account is signed in on the side: { token, email } of it, for merging.
export async function addMethod(kind, email, password) {
  const u = user();
  try {
    if (kind === 'password') await sdk.linkWithCredential(u, sdk.EmailAuthProvider.credential(email, password));
    else await sdk.linkWithPopup(u, kind === 'google' ? googleProvider() : appleProvider());
  } catch (e) {
    if (e.code === 'auth/provider-already-linked') {
      await u.reload();
      return null;
    }
    if (!TAKEN.includes(e.code)) throw e;
    let signed;
    try {
      if (kind === 'password') {
        signed = await sdk.signInWithEmailAndPassword(sideAuth(), email, password);
      } else {
        const credential = (kind === 'google' ? sdk.GoogleAuthProvider : sdk.OAuthProvider).credentialFromError(e);
        if (!credential) throw e;
        signed = await sdk.signInWithCredential(sideAuth(), credential);
      }
    } catch (other) {
      // Its password is another one, or it is in there another way.
      throw Object.assign(new Error(), { code: kind === 'password' ? 'merge/email-taken' : other.code || 'merge/failed' });
    }
    return { token: await signed.user.getIdToken(), email: shownEmail(signed.user) };
  }
  await u.reload();
  return null;
}

/// After a merge: a password can't move, so it is set here again (the other
/// account, and with it the address, is gone by now).
export async function afterMerge(kind, email, password) {
  const u = user();
  if (kind === 'password') await sdk.linkWithCredential(u, sdk.EmailAuthProvider.credential(email, password)).catch(() => {});
  await forgetOther();
  await u.reload();
}

export async function removeMethod(id) {
  await sdk.unlink(user(), id);
  await user().reload();
}

export const resetPassword = (email) => sdk.sendPasswordResetEmail(auth, email);

export const signOut = () => (auth ? sdk.signOut(auth) : Promise.resolve());

/// What the person reads when adding a way in failed; null if they cancelled.
export function addMessage(e) {
  const code = String(e?.code || '').replace(/^auth\//, '');
  switch (code) {
    case 'merge/email-taken':
      return tr('С этой почтой уже есть другой аккаунт. Чтобы объединить их, введи его пароль или добавь здесь тот способ, которым входишь в него.');
    case 'weak-password':
    case 'invalid-email':
    case 'missing-password':
    case 'too-many-requests':
    case 'network-request-failed':
    case 'popup-closed-by-user':
    case 'cancelled-popup-request':
    case 'user-cancelled':
      return authMessage(e);
    case 'popup-blocked':
      return tr('Браузер не дал открыть окно входа: разреши всплывающие окна и попробуй ещё раз');
    default:
      return tr('Не получилось добавить ({code})', { code: code || '?' });
  }
}

/// What the person reads, as in the apps.
export function authMessage(e) {
  const code = String(e?.code || '').replace(/^auth\//, '');
  switch (code) {
    case 'wrong-password':
    case 'invalid-credential':
    case 'invalid-login-credentials':
      return tr('Неверный пароль. Если раньше вход был через Google или Apple, нажми «Назад» и войди так же');
    case 'account-exists-with-different-credential':
      // One account per email: this one was made another way.
      return tr('С этой почтой уже есть аккаунт. Войди так же, как в прошлый раз.');
    case 'weak-password':
      return tr('Пароль слишком простой');
    case 'invalid-email':
    case 'missing-email':
      return tr('Проверь адрес почты');
    case 'missing-password':
      return tr('Введи пароль');
    case 'too-many-requests':
      return tr('Слишком много попыток, попробуй чуть позже');
    case 'user-disabled':
      return tr('Этот аккаунт отключён');
    case 'network-request-failed':
      return tr('Нет связи, проверь интернет');
    case 'popup-closed-by-user':
    case 'cancelled-popup-request':
    case 'user-cancelled':
      return null;
    case 'web-storage-unsupported':
    case 'unauthorized-domain':
    case 'internal-error':
      return tr('Вход не завершился, попробуй ещё раз');
    default:
      return tr('Не получилось войти ({code})', { code: code || '?' });
  }
}
