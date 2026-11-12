// Firebase Auth, right on the page: email+password and Google. The session
// stays in this browser (Firebase's local persistence) until signing out.

import { FIREBASE, FIREBASE_SDK } from './config.js';
import { LANG, tr } from './i18n.js';

let sdk = null;
let auth = null;

/// Loads the SDK; false if it couldn't be fetched (offline on the first visit).
export async function init(onChange) {
  try {
    const [app, fa] = await Promise.all([
      import(`${FIREBASE_SDK}/firebase-app.js`),
      import(`${FIREBASE_SDK}/firebase-auth.js`),
    ]);
    sdk = fa;
    auth = fa.getAuth(app.initializeApp(FIREBASE));
    auth.languageCode = LANG;
    fa.onAuthStateChanged(auth, onChange);
    // Back from a Google redirect (only when the popup was blocked).
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

export async function signInWithGoogle() {
  const provider = new sdk.GoogleAuthProvider();
  provider.setCustomParameters({ prompt: 'select_account' });
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

export const resetPassword = (email) => sdk.sendPasswordResetEmail(auth, email);

export const signOut = () => (auth ? sdk.signOut(auth) : Promise.resolve());

/// What the person reads, as in the apps.
export function authMessage(e) {
  const code = String(e?.code || '').replace(/^auth\//, '');
  switch (code) {
    case 'wrong-password':
    case 'invalid-credential':
    case 'invalid-login-credentials':
      return tr('Неверный пароль. Если раньше вход был через Google, нажми «Назад» и «Войти через Google»');
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
