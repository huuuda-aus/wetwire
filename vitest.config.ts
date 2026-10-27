import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['packages/**/*.test.ts', 'tools/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      include: ['packages/sim/src/**'],
      thresholds: { lines: 90 },
    },
  },
});
