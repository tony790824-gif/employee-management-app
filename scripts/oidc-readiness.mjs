import process from 'node:process';
import { checkOidcReadiness } from '../server/oidc-readiness.mjs';

function required(name) {
  const value = String(process.env[name] || '').trim();
  if (!value) throw new Error(`Missing ${name}. Configure it in the ignored local .env or secret store.`);
  return value;
}

try {
  const result = await checkOidcReadiness({
    issuer: required('BANK_OIDC_ISSUER'),
    audience: required('BANK_OIDC_AUDIENCE'),
    jwksUri: required('BANK_OIDC_JWKS_URL')
  });
  console.log(JSON.stringify(result));
} catch (error) {
  console.error(JSON.stringify({ ok: false, code: error.code || 'AUTH_CONFIG_MISSING', error: error.message }));
  process.exit(1);
}
