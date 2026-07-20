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
    dataBackend: 'google_sheets',
    backendUrl: 'https://script.google.com/macros/s/AKfycbw_c_AGjrq91Gjl_UrYMDxIzQtSUsW0PPm6H3WmJUEZZN2uXmvrXbKTlVxahLZ6OOzq/exec',
    postgresApiUrl: '',
    storagePrefix: '', cachePrefix: 'banke-production-', cacheName: 'banke-production-v1',
    manifest: Object.freeze({ id: './?app=banke-production', name: '班表管理', shortName: '班表管理', startUrl: './' })
  })
});

export function getEnvironmentProfile(name) {
  const profile = environmentProfiles[name];
  if (!profile) throw new Error(`Unsupported frontend environment: ${name}`);
  return profile;
}
