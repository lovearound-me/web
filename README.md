# Web app

Love Around in a browser tab, at [app.lovearound.me](https://app.lovearound.me):
the same account, book and hearts as the [Mac](https://github.com/lovearound-me/mac#readme)
and [Windows](https://github.com/lovearound-me/windows#readme) apps, for
sending from any computer or phone. Plain HTML, CSS and JS modules, no
framework and no bundler; Firebase Auth's JS SDK runs on the page. Settings
(colors, sound, pause…) live in this browser's `localStorage`, as the apps
keep theirs on the computer.

## What it does

As the apps do, with a tab in place of the tray:

- "О ком ты сейчас думаешь?": "Кому-нибудь на свете", the close ones'
  circles, then everyone else; a tap sends the heart.
- The book: add someone by their invite link or code, name, color, a circle
  at the top or not, drag to reorder (on a phone: hold, then drag), remove.
  Your own invite link to copy or share. `app.lovearound.me/i/<code>` and
  `?add=<code>` open the form for adding that person.
- Settings: your color, emoji, sound and quiet glow; pause; the pause between
  hearts; hearts from anyone; devices; the account (sign out, delete).
- Receiving works **only while the tab is open**: `WS /v1/stream`, the glow
  and the emoji over the page. A heart that comes while the tab is hidden
  puts a ♥ in its title and icon and plays when the tab is seen again.
  Nothing is made up for the time the socket was gone. A dropped socket
  reconnects at once when the tab comes back or the network returns, else
  with a backoff of 1 to 60 s. The first screen says so once, and Settings
  keep a line about it, with a link to the apps.
- Not a PWA: no service worker, manifest, Web Push or notifications. A
  browser can't hold a socket for a closed tab, and the apps do it better.

A browser can't put an `Authorization` header on a WebSocket, so the page
first asks `POST /v1/stream/ticket` (with the ID token) for a single-use
ticket valid 30 s, then opens `/v1/stream?ticket=…`. The server allows the
page's origin by CORS (`WEB_ORIGINS`).

## Layout

| Path | Contains |
|---|---|
| `src/index.html`, `src/style.css` | the page and its look (the apps' colors, light and dark) |
| `src/js/config.js` | API base, Firebase key, site |
| `auth.js`, `api.js`, `stream.js` | Firebase Auth, the `/v1` client, `WS /v1/stream` |
| `model.js` | the state; screens redraw when it changes |
| `settings.js` | what stays in this browser |
| `overlay.js` | the glow, the emoji and the chime |
| `home.js`, `book.js`, `settings-page.js`, `signin.js` | the screens; `ui.js` and `lib.js` shared |
| `router.js`, `app.js` | `#/…` addresses, the shell, startup |
| `i18n/<lang>.json` | the texts in 13 languages, keyed by the Russian text as in the apps |
| `build.py` | checks the dictionaries and writes `public/` |
| `firebase.json` | hosting config: the site `lovearound-app`, everything served by `index.html` |

## Build

```sh
python3 build.py            # public/: src/ plus the dictionaries
python3 build.py --check    # what each language lacks or doesn't use
cd public && python3 -m http.server 8000
```

On `localhost` the API can be pointed at a local server:
`http://localhost:8000/?api=http://localhost:8080`. Google sign-in needs
`localhost` among Firebase Auth's authorized domains (it is by default).

`./publish.sh` builds and deploys `public/` to the hosting site
`lovearound-app` with firebase-tools in Docker. The site, its domain
`app.lovearound.me` and the sign-in's authorized domains come from Terraform
in the server repo (`deploy/hosting.tf`, `deploy/auth.tf`).
