import { defineConfig } from 'vitest/config'
import { fileURLToPath } from 'node:url'

export default defineConfig({
  test: {
    // Os specs de e2e são do Playwright. Sem esta exclusão o vitest tenta
    // executá-los e falha com "did not expect test() to be called here", que
    // não diz nada sobre a causa.
    exclude: ['node_modules/**', 'e2e/**', '.next/**'],
  },
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('.', import.meta.url)),
      'server-only': fileURLToPath(new URL('./test/server-only.ts', import.meta.url)),
    },
  },
})
