// Where things are. The API can be pointed elsewhere for local runs only:
// http://localhost:8000/?api=http://localhost:8080 (kept for the tab).

export const VERSION = '0.1.0';
/// Sent as `X-Client`, so the server logs which client sent what.
export const CLIENT = `web/${VERSION}`;
export const SITE = 'https://lovearound.me';
/// Where the apps for a computer are.
export const DOWNLOADS = `${SITE}/#w-get`;

/// Our own Firebase Hosting hosts serve /__/auth/handler themselves. Signing in
/// through the page's own host keeps the Google sign-in first-party: through
/// firebaseapp.com, browsers that partition storage (Safari, Firefox, newer
/// Chrome) lose its state and show "missing initial state".
const OWN_HOSTS = ['app.lovearound.me', 'lovearound-app.web.app', 'lovearound-app.firebaseapp.com'];

/// Public: identifies the project to Firebase Auth (as on the site and in the apps).
export const FIREBASE = {
  apiKey: 'AIzaSyBZJfln_KXsxRxo3fvVaV1ePmiVUIn5YXY',
  authDomain: OWN_HOSTS.includes(location.hostname) ? location.hostname : 'needed-app-2026.firebaseapp.com',
  projectId: 'needed-app-2026',
};
export const FIREBASE_SDK = 'https://www.gstatic.com/firebasejs/10.12.2';

function localApi() {
  if (!['localhost', '127.0.0.1'].includes(location.hostname)) return null;
  try {
    const asked = new URLSearchParams(location.search).get('api');
    if (asked) sessionStorage.setItem('api', asked);
    return sessionStorage.getItem('api');
  } catch {
    return null;
  }
}

export const API = (localApi() || 'https://api.lovearound.me').replace(/\/$/, '');
export const WS = API.replace(/^http/, 'ws');
