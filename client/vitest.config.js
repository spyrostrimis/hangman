import { defineConfig, mergeConfig } from 'vitest/config';
import vite from './vite.config.js';
export default mergeConfig(vite, defineConfig({
  test: { environment: 'jsdom', include: ['src/**/*.test.jsx'], restoreMocks: true },
}));
