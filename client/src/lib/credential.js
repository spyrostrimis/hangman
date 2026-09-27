import { KDF, SALT_PATTERN, derivationSalt, toHex } from '../../../shared/auth-protocol.js';
export { KDF };

export function registrationParameters() {
  return { ...KDF, salt: toHex(crypto.getRandomValues(new Uint8Array(16))) };
}

export async function deriveCredential(password, parameters) {
  if (parameters?.algorithm !== KDF.algorithm || parameters.iterations !== KDF.iterations
    || parameters.version !== KDF.version || !SALT_PATTERN.test(parameters.salt)) {
    throw new Error('Unsupported sign-in parameters. Please reload and try again.');
  }
  if (!globalThis.crypto?.subtle) throw new Error('Secure sign-in requires HTTPS and a browser with Web Crypto support.');
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(password), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256',
    salt: derivationSalt(parameters.salt), iterations: parameters.iterations }, key, 256);
  return toHex(new Uint8Array(bits));
}
