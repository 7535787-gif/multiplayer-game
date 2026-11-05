import { defineConfig, devices } from '@playwright/test'

const port = process.env.E2E_PORT ?? '50310'
const baseURL = `http://127.0.0.1:${port}`

export default defineConfig({
  testDir: './e2e',
  fullyParallel: false,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? 'github' : 'list',
  use: { baseURL, trace: 'retain-on-failure' },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: {
    command: 'npm run build && npm run start -w server',
    url: `${baseURL}/health`,
    reuseExistingServer: false,
    timeout: 120_000,
    env: {
      PORT: port,
      ALLOWED_ORIGINS: `${baseURL},http://localhost:${port}`,
    },
  },
})
