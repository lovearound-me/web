// The signal itself, drawn in the page: its edges glow in the chosen color
// and emoji float up from the bottom. Ported from the Windows app's overlay.js;
// there it is a window over the whole screen, here it is the tab.

const WARM = [
  '❤️', '🧡', '💛', '💚', '💙', '💜', '💖', '💕', '💗',
  '🤗', '🥰', '😊', '☺️',
  '😺', '😸', '😻', '😽', '🐈', '🐱',
  '🐶', '🐻', '🐼', '🦔', '🐰', '🦊', '🐥', '🧸',
  '💪', '🙌', '👍', '✊', '👏',
  '☀️', '🌻', '🌷', '🌸', '🌼', '🌈', '🍀', '✨', '⭐️',
  '☕️', '🍵', '🍪', '🍰', '🍓', '🎈',
];
const STARS = ['⭐️', '🌟', '✨', '💫'];

const random = (a, b) => a + Math.random() * (b - a);
const pick = (list) => list[Math.floor(Math.random() * list.length)];

let layer, glow;
let running = [];

function ensure() {
  if (layer) return;
  layer = document.createElement('div');
  layer.className = 'overlay';
  layer.setAttribute('aria-hidden', 'true');
  glow = document.createElement('div');
  glow.className = 'glow';
  layer.append(glow);
  document.body.append(layer);
}

function clear() {
  for (const animation of running) animation.cancel();
  running = [];
  layer?.querySelectorAll('.emoji').forEach((node) => node.remove());
  if (glow) glow.style.opacity = 0;
}

/// { color: '#rrggbb', emoji: 'warm' | 'stars', count, calm, sound }
export function play({ color, emoji, count, calm, sound }) {
  ensure();
  clear();
  glow.style.boxShadow = `inset 0 0 44px 12px ${color}e6`;
  const flash = calm
    ? { opacity: [0, 0.7, 0.7, 0], offset: [0, 0.3, 0.7, 1] }
    : { opacity: [0, 1, 0.25, 1, 0.25, 1, 0], offset: [0, 0.12, 0.28, 0.45, 0.61, 0.78, 1] };
  running.push(glow.animate(flash, { duration: 2600, easing: 'ease-in-out', fill: 'forwards' }));

  // "Без мигания и полёта": the glow alone.
  if (!calm) {
    const list = emoji === 'stars' ? STARS : WARM;
    for (let i = 0; i < count; i++) fly(pick(list));
  }
  if (sound) chime();
}

function fly(symbol) {
  const width = innerWidth, height = innerHeight;
  const node = document.createElement('div');
  node.className = 'emoji';
  node.textContent = symbol;
  // A phone's screen is small: smaller emoji, so they don't cover it.
  const size = width < 500 ? random(20, 34) : random(24, 46);
  node.style.fontSize = size + 'px';
  node.style.top = height + 'px';
  layer.append(node);

  const x = random(0.04, 0.92) * width;
  const rise = random(0.45, 0.9) * height;
  const drift = random(-60, 60);
  const sway = random(14, 30) * (Math.random() < 0.5 ? -1 : 1);
  const tilt = random(0.1, 0.28) * (Math.random() < 0.5 ? -1 : 1);
  const steps = 12;
  const frames = [];
  for (let k = 0; k <= steps; k++) {
    const t = k / steps;
    const dx = x + drift * t + sway * Math.sin(t * Math.PI * 2);
    const dy = -size - rise * t;
    const angle = tilt * Math.sin(t * Math.PI * 3);
    const scale = 0.6 + 0.4 * Math.min(1, t / 0.25);
    const opacity = t < 0.1 ? t / 0.1 : t > 0.8 ? (1 - t) / 0.2 : 1;
    frames.push({ transform: `translate(${dx}px, ${dy}px) rotate(${angle}rad) scale(${scale})`, opacity, offset: t });
  }
  const animation = node.animate(frames, {
    duration: random(3000, 4600),
    delay: random(0, 1300),
    easing: 'cubic-bezier(.22,.7,.3,1)',
    fill: 'both',
  });
  animation.onfinish = () => node.remove();
  running.push(animation);
}

let audio;

/// A browser lets a page make sound only after a click or a key on it: the
/// first one wakes the sound up, so a later signal can chime.
export function wakeSound() {
  try {
    audio ??= new AudioContext();
    if (audio.state === 'suspended') audio.resume();
  } catch {
    // No sound here: the glow is enough.
  }
}

/// A soft two-note bell, quiet enough not to startle.
function chime() {
  try {
    audio ??= new AudioContext();
    audio.resume();
    const start = audio.currentTime + 0.05;
    [[880, 0], [1318.5, 0.16]].forEach(([frequency, at]) => {
      for (const [ratio, level] of [[1, 0.09], [2.01, 0.025]]) {
        const osc = audio.createOscillator();
        const gain = audio.createGain();
        osc.type = 'sine';
        osc.frequency.value = frequency * ratio;
        gain.gain.setValueAtTime(0, start + at);
        gain.gain.linearRampToValueAtTime(level, start + at + 0.012);
        gain.gain.exponentialRampToValueAtTime(0.0001, start + at + 1.4);
        osc.connect(gain).connect(audio.destination);
        osc.start(start + at);
        osc.stop(start + at + 1.5);
      }
    });
  } catch {
    // No sound device: the glow is enough.
  }
}
