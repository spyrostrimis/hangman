import { SignJWT, jwtVerify } from 'jose';
import { fromHex, toHex } from '../../shared/auth-protocol.js';

const encoder = new TextEncoder();
export const SESSION_SECONDS = 86400;
export const ISSUER = 'hangman-api';
export const AUDIENCE = 'hangman-player';

export function secretBytes(secret: string) {
  if (!secret || secret.length < 43) throw new Error('Missing authentication secret');
  return encoder.encode(secret);
}
async function hmacKey(secret: string) {
  return crypto.subtle.importKey('raw', secretBytes(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign', 'verify']);
}
function verifierMessage(usernameKey: string, salt: string, credential: string) {
  return encoder.encode(JSON.stringify(['hangman-verifier-v1', usernameKey, salt, credential]));
}
export async function makeVerifier(pepper: string, usernameKey: string, salt: string, credential: string) {
  return toHex(new Uint8Array(await crypto.subtle.sign('HMAC', await hmacKey(pepper), verifierMessage(usernameKey, salt, credential))));
}
export async function checkVerifier(pepper: string, usernameKey: string, salt: string, credential: string, verifier: string) {
  // Native verification avoids string equality and handwritten timing-sensitive loops.
  return crypto.subtle.verify('HMAC', await hmacKey(pepper), fromHex(verifier), verifierMessage(usernameKey, salt, credential));
}
export async function fakeSalt(secret: string, usernameKey: string) {
  const signature = await crypto.subtle.sign('HMAC', await hmacKey(secret), encoder.encode(`hangman-fake-salt-v1:${usernameKey}`));
  return toHex(new Uint8Array(signature).slice(0, 16));
}
export function sessionToken(secret: string, userId: string) {
  return new SignJWT({}).setProtectedHeader({ alg: 'HS256', typ: 'JWT' })
    .setSubject(userId).setIssuer(ISSUER).setAudience(AUDIENCE)
    .setIssuedAt().setExpirationTime(`${SESSION_SECONDS}s`).sign(secretBytes(secret));
}
export async function sessionUserId(secret: string, token: string) {
  const { payload } = await jwtVerify(token, secretBytes(secret), {
    algorithms: ['HS256'], issuer: ISSUER, audience: AUDIENCE,
    requiredClaims: ['exp', 'iat', 'sub'], maxTokenAge: `${SESSION_SECONDS}s`,
  });
  if (typeof payload.sub !== 'string') throw new Error('Invalid subject');
  return payload.sub;
}
