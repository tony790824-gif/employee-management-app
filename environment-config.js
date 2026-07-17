(() => {
  const config = Object.freeze({
    name: 'production', label: '',
    backendUrl: 'https://script.google.com/macros/s/AKfycbw_c_AGjrq91Gjl_UrYMDxIzQtSUsW0PPm6H3WmJUEZZN2uXmvrXbKTlVxahLZ6OOzq/exec',
    storagePrefix: '', serviceWorkerUrl: './service-worker.js'
  });
  const storageKey = key => `${config.storagePrefix}${key}`;
  window.shiftEnvironment = Object.freeze({ ...config, storageKey });
  document.documentElement.dataset.appEnvironment = config.name;
  if (!config.label) return;
  document.title = `[${config.label}] ${document.title}`;
  window.addEventListener('DOMContentLoaded', () => {
    const badge = document.createElement('div');
    badge.id = 'environmentBadge';
    badge.className = 'environment-badge';
    badge.setAttribute('role', 'status');
    badge.textContent = config.label;
    document.body.prepend(badge);
  }, { once: true });
})();
