// This package's own test run, merged over `vitest.config.base.ts` so issue #255's
// foreign-workspace-link refusal applies here as everywhere else.

import { defineConfig, mergeConfig } from 'vitest/config';
import baseConfig from '../../vitest.config.base.js';

export default mergeConfig(
  baseConfig,
  defineConfig({
    test: {
      name: 'llm-client',
      environment: 'node',
      include: ['src/**/*.test.ts'],
    },
  }),
);
