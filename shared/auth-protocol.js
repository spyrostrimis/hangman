// Versioned wire format. Changing derivation requires an explicit migration.
export const KDF = Object.freeze({ algorithm: 'PBKDF2-SHA-256', iterations: 600000, version: 1 });
export const SALT_PATTERN = /^[a-f0-9]{32}$/;
export const CREDENTIAL_PATTERN = /^[a-f0-9]{64}$/;
export const USERNAME_PATTERN = /^[A-Za-z0-9]{3,35}$/;
export const normalizeUsername = username => username.trim().toLowerCase();
export const toHex = bytes => Array.from(bytes, byte => byte.toString(16).padStart(2, '0')).join('');
export const fromHex = hex => Uint8Array.from(hex.match(/../g) ?? [], byte => parseInt(byte, 16));
export const derivationSalt = salt => new TextEncoder().encode(`hangman.spyrostrimis.com:password:v1:${salt}`);
