import { randomBytes } from 'node:crypto';
import { existsSync, writeFileSync } from 'node:fs';
if (existsSync('.dev.vars')) {
  console.log('Local secrets already exist; preserved.');
} else {
  const contents = ['JWT_SECRET', 'AUTH_PEPPER', 'SALT_SECRET']
    .map(name => `${name}=${randomBytes(32).toString('base64url')}`).join('\n');
  writeFileSync('.dev.vars', `${contents}\n`, { flag: 'wx' });
  console.log('Created ignored local development secrets.');
}
