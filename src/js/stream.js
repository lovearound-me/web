// WS /v1/stream, while the tab is open. A browser can't put a token on a
// socket, so each connection first gets a one-time ticket over HTTPS.
//
// A browser answers the server's pings by itself and tells the page nothing,
// so a socket that died quietly (Wi-Fi gone, the laptop slept) is found only
// when the browser closes it, when the tab comes back into view, or when
// the network comes back. Then it reconnects at once; otherwise it waits
// 1 s, 2 s, 4 s… up to a minute between tries.

import { WS } from './config.js';
import { streamTicket, ApiError } from './api.js';

const CONNECT_TIMEOUT = 20_000;

export class Stream {
  /// on: { online(up), sync(), signal(), authLost() }
  constructor(on) {
    this.on = on;
    this.anyone = true;
    this.running = false;
    this.ws = null;
    this.backoff = 1;
    this.timer = null;
    this.attempt = 0;
    this.up = false;
    this.fetching = false;

    const now = () => this.now();
    document.addEventListener('visibilitychange', () => document.visibilityState === 'visible' && now());
    addEventListener('online', now);
    addEventListener('offline', () => this.restart());
    addEventListener('pageshow', (e) => e.persisted && now());

    // A laptop that slept: the timers stood still, so a long gap between
    // ticks means the socket is most likely dead without knowing it.
    let tick = Date.now();
    setInterval(() => {
      const gap = Date.now() - tick;
      tick = Date.now();
      if (gap > 75_000 && this.running) this.restart();
    }, 5_000);
  }

  start(anyone) {
    this.anyone = anyone;
    if (this.running) return;
    this.running = true;
    this.backoff = 1;
    this.connect();
  }

  stop() {
    this.running = false;
    this.drop();
    clearTimeout(this.timer);
    this.timer = null;
  }

  /// Takes signals to anyone, or not: the server learns it on connecting.
  setAnyone(anyone) {
    if (anyone === this.anyone) return;
    this.anyone = anyone;
    if (this.running) this.restart();
  }

  /// Back in view or back online: connect now if the socket is gone.
  now() {
    if (!this.running) return;
    if (this.ws && (this.ws.readyState === WebSocket.OPEN || this.ws.readyState === WebSocket.CONNECTING)) return;
    if (this.fetching) return; // getting a ticket right now
    clearTimeout(this.timer);
    this.timer = null;
    this.backoff = 1;
    this.connect();
  }

  restart() {
    if (!this.running) return;
    this.drop();
    clearTimeout(this.timer);
    this.timer = null;
    this.backoff = 1;
    this.connect();
  }

  drop() {
    const ws = this.ws;
    this.ws = null;
    this.attempt++;
    this.fetching = false;
    if (ws) {
      ws.onopen = ws.onmessage = ws.onclose = ws.onerror = null;
      try {
        ws.close();
      } catch {
        // Already closed.
      }
    }
    this.online(false);
  }

  online(up) {
    if (this.up === up) return;
    this.up = up;
    this.on.online(up);
  }

  later() {
    if (!this.running) return;
    const delay = this.backoff;
    this.backoff = Math.min(this.backoff * 2, 60);
    clearTimeout(this.timer);
    this.timer = setTimeout(() => {
      this.timer = null;
      this.connect();
    }, delay * 1000);
  }

  async connect() {
    const attempt = ++this.attempt;
    let ticket;
    this.fetching = true;
    try {
      ticket = (await streamTicket()).ticket;
    } catch (e) {
      if (attempt === this.attempt) this.fetching = false;
      if (attempt !== this.attempt || !this.running) return;
      if (e instanceof ApiError && e.endsSession) {
        this.running = false;
        this.on.authLost();
        return;
      }
      this.online(false);
      this.later();
      return;
    }
    if (attempt !== this.attempt || !this.running) return;
    this.fetching = false;

    const url = `${WS}/v1/stream?ticket=${encodeURIComponent(ticket)}${this.anyone ? '' : '&anyone=false'}`;
    let ws;
    try {
      ws = new WebSocket(url);
    } catch {
      this.later();
      return;
    }
    this.ws = ws;
    const timeout = setTimeout(() => ws.readyState !== WebSocket.OPEN && fail(), CONNECT_TIMEOUT);
    const fail = () => {
      clearTimeout(timeout);
      if (this.ws !== ws) return;
      this.ws = null;
      ws.onopen = ws.onmessage = ws.onclose = ws.onerror = null;
      try {
        ws.close();
      } catch {
        // Already closed.
      }
      this.online(false);
      this.later();
    };
    ws.onclose = fail;
    ws.onerror = fail;
    ws.onopen = () => clearTimeout(timeout);
    ws.onmessage = (message) => {
      let msg;
      try {
        msg = JSON.parse(message.data);
      } catch {
        return;
      }
      if (msg.type === 'ready') {
        this.backoff = 1;
        this.online(true);
        this.on.sync();
      } else if (msg.type === 'sync') {
        this.on.sync();
      } else if (msg.type === 'event') {
        // Unknown types and versions are ignored, so old clients survive new events.
        const event = msg.event || {};
        if (event.type === 'signal' && event.v === 1) this.on.signal();
      }
    };
  }
}
