function originOf(value) {
  const raw = String(value || '').trim();
  if (!raw) return '';
  const url = new URL(raw);
  if (url.protocol !== 'https:' || url.username || url.password) {
    throw new Error('Security-header origins must be credential-free HTTPS URLs.');
  }
  return url.origin;
}

function directive(name, values) {
  return `${name} ${[...new Set(values.filter(Boolean))].join(' ')}`;
}

export function createSecurityHeaders({ profile, auth0SdkUrl = '' }) {
  const backendOrigin = originOf(profile.backendUrl);
  const postgresOrigin = originOf(profile.postgresApiUrl);
  const auth0Origin = profile.auth?.domain ? originOf(`https://${profile.auth.domain}`) : '';
  const auth0SdkOrigin = originOf(auth0SdkUrl);
  const googleTransport = profile.dataBackend === 'google_sheets';

  const csp = [
    directive('default-src', ["'self'"]),
    directive('base-uri', ["'self'"]),
    directive('object-src', ["'none'"]),
    directive('frame-ancestors', ["'none'"]),
    directive('script-src', ["'self'", "'unsafe-inline'", auth0SdkOrigin]),
    directive('style-src', ["'self'", "'unsafe-inline'"]),
    directive('img-src', ["'self'", 'data:', 'blob:']),
    directive('font-src', ["'self'", 'data:']),
    directive('connect-src', ["'self'", backendOrigin, postgresOrigin, auth0Origin]),
    directive('frame-src', googleTransport
      ? ["'self'", 'https://script.google.com', 'https://*.googleusercontent.com']
      : ["'self'"]),
    directive('form-action', googleTransport ? ["'self'", backendOrigin] : ["'self'"]),
    directive('worker-src', ["'self'", 'blob:']),
    directive('manifest-src', ["'self'"]),
    'upgrade-insecure-requests'
  ].join('; ');

  return `/*
  Content-Security-Policy: ${csp}
  Strict-Transport-Security: max-age=31536000; includeSubDomains
  X-Content-Type-Options: nosniff
  X-Frame-Options: DENY
  Referrer-Policy: no-referrer
  Permissions-Policy: camera=(), microphone=(), geolocation=(), payment=(), usb=()
  Cross-Origin-Opener-Policy: same-origin-allow-popups
  Cross-Origin-Resource-Policy: same-origin
  Cache-Control: no-cache, must-revalidate
`;
}
