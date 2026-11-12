// The /v1 client; the contract is in the server repo, docs/schema.md.

import { API, CLIENT } from './config.js';
import { token } from './auth.js';
import { tr } from './i18n.js';

export class ApiError extends Error {
  constructor(status, text) {
    super(text || `HTTP ${status}`);
    this.status = status;
    this.text = text || '';
  }
  /// Signed out, or the session can no longer be used.
  get endsSession() {
    return this.status === 401;
  }
}

async function request(method, path, body) {
  for (let attempt = 0; attempt < 2; attempt++) {
    let bearer;
    try {
      bearer = await token(attempt > 0);
    } catch (e) {
      throw e.code === 'signed-out' || String(e.code).startsWith('auth/user') ? new ApiError(401, 'signed out') : new ApiError(0, 'network');
    }
    let response;
    try {
      response = await fetch(`${API}/${path}`, {
        method,
        headers: {
          Authorization: `Bearer ${bearer}`,
          'X-Client': CLIENT,
          ...(body ? { 'Content-Type': 'application/json' } : {}),
        },
        body: body ? JSON.stringify(body) : undefined,
      });
    } catch {
      throw new ApiError(0, 'network');
    }
    if (response.status === 401 && attempt === 0) continue;
    const text = await response.text().catch(() => '');
    let json = null;
    try {
      json = text ? JSON.parse(text) : null;
    } catch {
      json = null;
    }
    if (!response.ok) throw new ApiError(response.status, json?.error);
    return json;
  }
  throw new ApiError(401, 'unauthorized');
}

export const me = () => request('GET', 'v1/me');
export const deleteMe = () => request('DELETE', 'v1/me');
export const contacts = async () => (await request('GET', 'v1/contacts'))?.contacts ?? [];
export const addContact = (code, label, close) => request('POST', 'v1/contacts', { code, label, close });
export const updateContact = (id, fields) => request('PATCH', `v1/contacts/${encodeURIComponent(id)}`, fields);
export const deleteContact = (id) => request('DELETE', `v1/contacts/${encodeURIComponent(id)}`);
export const signal = (id) => request('POST', 'v1/events', { type: 'signal', to: { contact: id } });
export const signalAnyone = () => request('POST', 'v1/events', { type: 'signal', to: { anyone: true } });
export const devices = async () => (await request('GET', 'v1/devices'))?.devices ?? [];
/// `{device, token}`: the token comes back only here, once.
export const addDevice = (name, capabilities) => request('POST', 'v1/devices', { name, kind: 'custom', capabilities });
export const deleteDevice = (id) => request('DELETE', `v1/devices/${encodeURIComponent(id)}`);
/// A one-time ticket for the socket: a browser can't send headers there.
export const streamTicket = () => request('POST', 'v1/stream/ticket');

/// What the person reads, as in the apps.
export function apiMessage(e) {
  if (!(e instanceof ApiError)) return tr('Сервер не ответил, попробуй ещё раз');
  if (e.status === 0) return tr('Нет связи, проверь интернет');
  if (e.status === 401) return tr('Нужно войти заново');
  if (e.status === 400 && e.text === 'that is your own invite') return tr('Это твоя собственная ссылка');
  if (e.status === 400 && e.text === 'not an invite code') return tr('Не похоже на ссылку-приглашение');
  if (e.status === 400 && e.text === 'too many contacts') return tr('В списке уже 200 человек');
  if (e.status === 400 && e.text === 'too many devices') return tr('Устройств уже много, отключи лишние');
  if (e.status === 404) return tr('Не нашли');
  if (e.status === 409) return tr('Уже есть в списке');
  if (e.status === 429) return tr('Слишком много попыток, попробуй через час');
  return tr('Сервер не ответил, попробуй ещё раз');
}
