const query = matchMedia('(prefers-color-scheme: dark)');
let preference = 'system';
try { preference = localStorage.getItem('ivory.theme') || 'system'; } catch {}
if (!['light','dark','system'].includes(preference)) preference = 'system';
export const themePreference = () => preference;
export const darkTheme = () => document.documentElement.dataset.theme === 'dark';
export function setTheme(mode) {
  preference = ['light','dark','system'].includes(mode) ? mode : 'system';
  try { localStorage.setItem('ivory.theme', preference); } catch {}
  document.documentElement.dataset.theme = preference === 'system' ? (query.matches ? 'dark' : 'light') : preference;
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', darkTheme() ? '#141e19' : '#173d32');
  for(const button of document.querySelectorAll('[data-action="theme"]')) {
    button.setAttribute('aria-label',darkTheme() ? 'Activar modo claro' : 'Activar modo oscuro');
    button.setAttribute('title',darkTheme() ? 'Activar modo claro' : 'Activar modo oscuro');
    button.textContent = darkTheme() ? '☀' : '☾';
  }
}
query.addEventListener('change',()=>{if(preference==='system')setTheme('system');});
setTheme(preference);
