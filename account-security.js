(() => {
  const ACTIVATION_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
  const ACTIVATION_LENGTH = 8;

  const hashSecret = async value => {
    const digest = await crypto.subtle.digest(
      'SHA-256',
      new TextEncoder().encode(String(value || ''))
    );
    return [...new Uint8Array(digest)]
      .map(byte => byte.toString(16).padStart(2, '0'))
      .join('');
  };

  const generateActivationCode = () => {
    const result = [];
    const acceptedRange = Math.floor(256 / ACTIVATION_ALPHABET.length) * ACTIVATION_ALPHABET.length;
    while (result.length < ACTIVATION_LENGTH) {
      const bytes = new Uint8Array(ACTIVATION_LENGTH - result.length);
      crypto.getRandomValues(bytes);
      bytes.forEach(byte => {
        if (result.length < ACTIVATION_LENGTH && byte < acceptedRange) {
          result.push(ACTIVATION_ALPHABET[byte % ACTIVATION_ALPHABET.length]);
        }
      });
    }
    return result.join('');
  };

  const normalizeActivationCode = value => String(value || '')
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '');

  const cleanPhone = value => String(value || '').replace(/[^0-9]/g, '');

  window.shiftAccountSecurity = Object.freeze({
    activationCodeLength: ACTIVATION_LENGTH,
    cleanPhone,
    generateActivationCode,
    hashSecret,
    normalizeActivationCode
  });
})();
