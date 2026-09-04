import { defineConfig, devices } from '@playwright/test'

/**
 * Fluxos críticos no navegador.
 *
 * Roda contra a aplicação de verdade, com o banco de desenvolvimento. Os
 * testes que exigem sessão são pulados quando as contas de teste não estão
 * configuradas, para que a suíte continue útil em máquina de quem acabou de
 * clonar o repositório.
 */
export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? 'github' : 'list',
  use: {
    baseURL: process.env.BASE_URL ?? 'http://127.0.0.1:3000',
    trace: 'on-first-retry',
    // O produto é usado no celular, em pé, com uma mão. Testar em desktop
    // primeiro esconde exatamente os problemas que importam.
    ...devices['Pixel 7'],
    // Permite usar um Chromium já instalado na máquina, em vez de baixar um
    // por versão do Playwright.
    launchOptions: process.env.CHROMIUM_PATH
      ? { executablePath: process.env.CHROMIUM_PATH }
      : undefined,
  },
  webServer: process.env.BASE_URL
    ? undefined
    : {
        command: 'npm run build && npm start',
        url: 'http://127.0.0.1:3000/entrar',
        reuseExistingServer: !process.env.CI,
        timeout: 180_000,
      },
})
