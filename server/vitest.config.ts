import { defineConfig } from 'vitest/config';
import { cloudflareTest, readD1Migrations } from '@cloudflare/vitest-pool-workers';
import { randomBytes } from 'node:crypto';

export default defineConfig(async () => ({
  plugins: [cloudflareTest({
    wrangler: { configPath: './wrangler.jsonc', environment: 'local' },
    miniflare: { bindings: {
      APP_ORIGIN: 'https://hangman.spyrostrimis.com', LOCAL_DEV: 'false',
      JWT_SECRET: randomBytes(32).toString('base64url'),
      AUTH_PEPPER: randomBytes(32).toString('base64url'),
      SALT_SECRET: randomBytes(32).toString('base64url'),
      TEST_MIGRATIONS: await readD1Migrations('./migrations'),
    } },
  })],
  test: { include: ['test/**/*.test.ts'] },
}));
