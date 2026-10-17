import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['test/**/*.test.ts'],
    coverage: {
      include: ['src/**/*.ts'],
      exclude: ['src/server.ts', 'src/handlers/context.ts'],
      thresholds: { lines: 80 },
    },
  },
});
