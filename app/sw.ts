import type { PrecacheEntry, SerwistGlobalConfig } from 'serwist'
import { CacheFirst, ExpirationPlugin, NetworkOnly, Serwist, StaleWhileRevalidate } from 'serwist'

declare global {
  interface WorkerGlobalScope extends SerwistGlobalConfig {
    __SW_MANIFEST: (PrecacheEntry | string)[] | undefined
  }
}
declare const self: ServiceWorkerGlobalScope

const serwist = new Serwist({
  precacheEntries: self.__SW_MANIFEST,
  skipWaiting: true,
  clientsClaim: true,
  /**
   * Sem `defaultCache`.
   *
   * O `defaultCache` do Serwist guarda navegações e payloads RSC com
   * NetworkFirst. Neste produto isso significa gravar no CacheStorage o nome
   * dos filhos, o saldo, o histórico inteiro e o nome de quem lançou — e o
   * CacheStorage é por origem, não por sessão.
   *
   * O aparelho que este produto assume é o tablet compartilhado da família.
   * Um responsável sai, outra pessoa entra, e uma resposta de rede lenta faz
   * o NetworkFirst servir a página do usuário anterior. Pior: qualquer script
   * na origem lê tudo com um `caches.match()`, que é exatamente o cenário de
   * XSS que o restante do desenho tenta encarecer.
   *
   * A troca: leitura offline de saldo e histórico deixa de existir. É perda
   * real, e é menor do que o vazamento. Quando houver um jeito de guardar por
   * sessão, ela volta.
   */
  runtimeCaching: [
    // Estáticos com hash no nome: imutáveis, e sem nada de ninguém dentro.
    {
      matcher: ({ url, sameOrigin }: { url: URL; sameOrigin: boolean }) =>
        sameOrigin && /^\/_next\/static\//.test(url.pathname),
      handler: new CacheFirst({
        cacheName: 'estaticos',
        plugins: [new ExpirationPlugin({ maxEntries: 200, maxAgeSeconds: 60 * 60 * 24 * 30 })],
      }),
    },
    // Ícones e fontes: públicos por natureza.
    {
      matcher: ({ request, sameOrigin }: { request: Request; sameOrigin: boolean }) =>
        sameOrigin && ['image', 'font', 'style'].includes(request.destination),
      handler: new StaleWhileRevalidate({
        cacheName: 'midia',
        plugins: [new ExpirationPlugin({ maxEntries: 60, maxAgeSeconds: 60 * 60 * 24 * 30 })],
      }),
    },
    // Todo o resto — páginas, RSC, dados — nunca é guardado.
    { matcher: () => true, handler: new NetworkOnly() },
  ],

  navigationPreload: true,
})

serwist.addEventListeners()
