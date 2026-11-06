// Entry point: detect device capabilities, build the game, show the start overlay.
import { detectCapabilities } from './core/Capabilities.js';
import { Game } from './core/Game.js';
import { DomOverlay } from './ui/DomOverlay.js';

const bar = document.getElementById('loading-bar');
const txt = document.getElementById('loading-text');
const progress = (p, label) => { bar.style.width = Math.round(p * 100) + '%'; txt.textContent = label; };

async function boot() {
  progress(0.05, 'Detecting device');
  const caps = await detectCapabilities();
  const game = new Game(caps, document.getElementById('app'));
  window.__game = game; // handy for debugging in the browser console
  await game.init(progress);
  const overlay = new DomOverlay(game);
  overlay.init();
  document.getElementById('loading').classList.add('hidden');
}

boot().catch((e) => {
  console.error(e);
  txt.textContent = 'Failed to start: ' + (e && e.message ? e.message : e);
  txt.style.color = '#ff6a5a';
});
