import { defineConfig, devices } from '@playwright/test'

/**
 * Fluxos críticos no navegador.
 *
 * Roda contra a aplicação de verdade, com o banco de desenvolvimento. Os
 * testes que exigem sessão são pulados quando as contas de teste não estão
 * configuradas, para que a suíte continue útil em máquina de quem acabou de
 * clonar o repositório.
 */
/**
 * Em ambiente com proxy de saída obrigatório, nem o navegador nem o cliente
 * HTTP do Playwright leem HTTPS_PROXY sozinhos. Sem isto as requisições
 * falham de formas que não parecem rede: cabeçalho `undefined`, página em
 * branco, tempo esgotado.
 */
// Só quando o alvo é remoto: com o servidor local em 127.0.0.1, mandar o
// navegador pelo proxy corporativo faz toda navegação falhar.
const proxy = process.env.BASE_URL
  ? (process.env.HTTPS_PROXY ?? process.env.https_proxy)
  : undefined

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
    ...(proxy
      ? {
          proxy: { server: proxy },
          // O proxy reassina o TLS com uma autoridade própria, que o navegador
          // do teste não conhece. Aceitável aqui, e só aqui: vale para o
          // navegador do teste, nunca para o produto.
          ignoreHTTPSErrors: true,
        }
      : {}),
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
