export const deployFiles = Object.freeze([
  'index.html',
  'app-icon.svg',
  'manifest.webmanifest',
  'service-worker.js',
  'style.css',
  'access.css',
  'login.css',
  'login-screen.css',
  'employee-calendar.css',
  'employee-layout.css',
  'google-sheets-config.js',
  'state-store.js',
  'account-security.js',
  'dom-safety.js',
  'app.js',
  'access.js',
  'employee-work.js',
  'boss-hours.js',
  'management-actions.js',
  'login.js',
  'cloud-sync.js',
  'google-sheets-cloud.js',
  'enhancements.js',
  'pwa.js',
  'employee-layout.js'
]);

export const sourceScripts = Object.freeze(
  deployFiles.filter(file => file.endsWith('.js'))
);
