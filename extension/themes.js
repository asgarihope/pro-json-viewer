import { readStored, writeStored } from './storage.js';
export const THEMES = [
  { id: 'midnight', name: 'Midnight', mode: 'dark', swatch: '#3997ff', background: '#101419' },
  { id: 'light', name: 'Daylight', mode: 'light', swatch: '#1769cf', background: '#f8fafc' },
  { id: 'ocean', name: 'Ocean', mode: 'dark', swatch: '#29bad4', background: '#0c1b27' },
  { id: 'forest', name: 'Forest', mode: 'dark', swatch: '#66bd8a', background: '#111d19' },
  { id: 'plum', name: 'Plum', mode: 'dark', swatch: '#b897f3', background: '#20182a' },
  { id: 'sepia', name: 'Sepia', mode: 'light', swatch: '#8f6038', background: '#f7f0e4' },
];
export const validTheme = value => THEMES.some(t => t.id === value) ? value : 'midnight';

export async function initThemes({ notify = () => {} } = {}) {
  const $ = id => document.getElementById(id);
  let current = 'midnight';
  function apply(value) {
    current = validTheme(value); document.documentElement.dataset.theme = current;
    for (const button of $('theme-options').children) {
      const selected = button.dataset.themeValue === current;
      button.setAttribute('aria-checked', String(selected)); button.tabIndex = selected ? 0 : -1;
    }
    $('theme-toggle').title = `Appearance · ${THEMES.find(t => t.id === current).name}`;
    document.dispatchEvent(new Event('themechange'));
  }
  function close(restore = false) {
    $('appearance-panel').hidden = true; $('theme-toggle').setAttribute('aria-expanded', 'false');
    if (restore) $('theme-toggle').focus({ preventScroll: true });
  }
  function choose(id) {
    apply(id);
    writeStored('appearance', { theme: current }).catch(() => notify('Could not save the theme. It is applied for this session.'));
  }
  for (const theme of THEMES) {
    const button = document.createElement('button'); button.type = 'button'; button.className = 'theme-option'; button.dataset.themeValue = theme.id;
    button.setAttribute('role', 'radio'); button.setAttribute('aria-label', `${theme.name}, ${theme.mode}`);
    const sample = document.createElement('span'); sample.className = 'theme-sample'; sample.style.setProperty('--sample-bg', theme.background); sample.style.setProperty('--sample-accent', theme.swatch);
    sample.setAttribute('aria-hidden', 'true');
    const name = document.createElement('span'); name.textContent = theme.name;
    button.append(sample, name); button.addEventListener('click', () => choose(theme.id)); $('theme-options').append(button);
  }
  apply((await readStored('appearance'))?.theme);
  $('theme-toggle').addEventListener('click', () => {
    const open = $('appearance-panel').hidden;
    $('appearance-panel').hidden = !open; $('theme-toggle').setAttribute('aria-expanded', String(open));
    if (open) $('theme-options').querySelector('[aria-checked="true"]').focus({ preventScroll: true });
  });
  $('appearance-close').addEventListener('click', () => close(true));
  $('appearance-panel').addEventListener('keydown', event => {
    if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); close(true); return; }
    if (!['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Home', 'End'].includes(event.key)) return;
    event.preventDefault();
    const at = THEMES.findIndex(theme => theme.id === current);
    const index = event.key === 'Home' ? 0 : event.key === 'End' ? THEMES.length - 1 : (at + (event.key === 'ArrowLeft' || event.key === 'ArrowUp' ? -1 : 1) + THEMES.length) % THEMES.length;
    choose(THEMES[index].id); $('theme-options').children[index].focus();
  });
  document.addEventListener('pointerdown', event => { if (!$('appearance-panel').contains(event.target) && !$('theme-toggle').contains(event.target)) close(); });
  if (globalThis.chrome?.storage?.onChanged) chrome.storage.onChanged.addListener((changes, area) => { if (area === 'local' && changes.appearance) apply(changes.appearance.newValue?.theme); });
  else window.addEventListener('storage', event => { if (event.key === 'json-viewer:appearance') { try { apply(JSON.parse(event.newValue)?.theme); } catch { apply('midnight'); } } });
}
