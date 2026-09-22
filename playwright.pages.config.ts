import { defineConfig } from '@playwright/test';
import workspaceConfig from './playwright.config';

const pagesUrl = 'http://127.0.0.1:5179/pulsegraph/';

export default defineConfig(workspaceConfig, {
  testDir: './tests/pages',
  use: { ...workspaceConfig.use, baseURL: pagesUrl },
  webServer: {
    command:
      'npm run build -- --base=/pulsegraph/ && npm run preview -- --base=/pulsegraph/ --host 127.0.0.1 --port 5179 --strictPort',
    url: pagesUrl,
    reuseExistingServer: false,
  },
});
