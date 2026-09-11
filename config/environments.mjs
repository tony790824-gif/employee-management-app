export const ENVIRONMENT_NAMES = Object.freeze(['local', 'staging', 'production']);

export const environmentProfiles = Object.freeze({
  local: Object.freeze({
    name: 'local', label: 'LOCAL PREVIEW', dataBackend: 'local_preview', backendUrl: '', postgresApiUrl: '', storagePrefix: 'banke:local:', cachePrefix: 'banke-local-', cacheName: 'banke-local-v1',
    manifest: Object.freeze({ id: './?app=banke-local', name: '班表管理（本機預覽）', shortName: '班表 LOCAL', startUrl: './?preview=boss' })
  }),
  staging: Object.freeze({
    name: 'staging', label: 'STAGING',
    dataBackend: 'google_sheets',
    backendUrl: 'https://script.google.com/macros/s/AKfycbwdg-jbAn6ENzsDJrsdXoVZz2Z9KAyDKfCuKj2FeT23UgHgUFHtakHOrHboUeX3WpJ3/exec',
    postgresApiUrl: '',
    auth: Object.freeze({
      domain: 'dev-nkduawjn5itjlhx4.us.auth0.com',
      clientId: 'nOBwjFDzFaEVnsWCfeoofsCyeDMqkrMu',
      audience: 'https://bankeban-staging-api'
    }),
    storagePrefix: 'banke:staging:', cachePrefix: 'banke-staging-', cacheName: 'banke-staging-v1',
    manifest: Object.freeze({ id: './?app=banke-staging', name: '班表管理 STAGING', shortName: '班表 STG', startUrl: './?app=banke-staging' })
  }),
  production: Object.freeze({
    name: 'production', label: '',
    dataBackend: 'postgres',
    backendUrl: '',
    postgresApiUrl: '',
    auth: Object.freeze({
      domain: String(process.env.BANKE_PRODUCTION_AUTH0_DOMAIN || '').trim(),
      clientId: String(process.env.BANKE_PRODUCTION_AUTH0_CLIENT_ID || '').trim(),
      audience: String(process.env.BANKE_PRODUCTION_AUTH0_AUDIENCE || '').trim()
    }),
    storagePrefix: '', cachePrefix: 'banke-production-', cacheName: 'banke-production-v2',
    manifest: Object.freeze({ id: './?app=banke-production', name: '班表管理', shortName: '班表管理', startUrl: './' })
  })
});

export function getEnvironmentProfile(name) {
  const profile = environmentProfiles[name];
  if (!profile) throw new Error(`Unsupported frontend environment: ${name}`);
  if (name === 'production') {
    const raw = String(process.env.BANKE_PRODUCTION_POSTGRES_API_URL || '').trim();
    let url;
    try { url = new URL(raw); } catch { throw new Error('PRODUCTION_API_URL_REQUIRED_OR_INVALID'); }
    const host = url.hostname.toLowerCase();
    const stagingApi = String(process.env.BANKE_STAGING_POSTGRES_API_URL || '').trim().replace(/\/$/, '');
    if (url.protocol !== 'https:' || url.username || url.password || url.search || url.hash
      || !/^\/v1\/?$/.test(url.pathname)
      || host === 'steady-salmiakki-4aaa19.netlify.app'
      || /(^|[.-])(localhost|local|staging)([.-]|$)/.test(host)
      || host === '[::1]' || /^127\./.test(host)
      || url.href.replace(/\/$/, '') === stagingApi) {
      throw new Error('PRODUCTION_API_URL_INVALID');
    }
    const workspaceId = String(process.env.BANKE_PRODUCTION_WORKSPACE_ID || '').trim();
    if (!/^ws_[a-f0-9]{32}$/.test(workspaceId)) throw new Error('PRODUCTION_WORKSPACE_ID_REQUIRED_OR_INVALID');
    return Object.freeze({ ...profile, postgresApiUrl: url.href.replace(/\/$/, ''), postgresWorkspaceId: workspaceId });
  }
  return profile;
}
