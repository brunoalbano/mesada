import { defaultCache } from '@serwist/next/worker'
import type { PrecacheEntry, SerwistGlobalConfig } from 'serwist'
import { NetworkOnly, Serwist } from 'serwist'

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
  runtimeCaching: [
    /**
     * Precisa vir ANTES do defaultCache: a primeira regra que casa é a que
     * vale.
     *
     * `/convite/*` carrega o token na URL, e `/auth/*` troca código por
     * sessão. O `defaultCache` guarda navegações com NetworkFirst, então sem
     * esta regra essas respostas ficariam no CacheStorage indexadas pelo
     * caminho com o token — num tablet compartilhado, legíveis depois, e por
     * XSS.
     *
     * O `exclude` do next.config.ts não cobre isto: ele tira as rotas do
     * precache, e não do cache de runtime.
     */
    {
      matcher: ({ url, sameOrigin }: { url: URL; sameOrigin: boolean }) =>
        sameOrigin && /^\/(convite|auth)(\/|$)/.test(url.pathname),
      handler: new NetworkOnly(),
    },
    ...defaultCache,
  ],

  navigationPreload: true,
})

serwist.addEventListeners()
