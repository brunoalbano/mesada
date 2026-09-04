import { defaultCache } from '@serwist/next/worker'
import type { PrecacheEntry, SerwistGlobalConfig } from 'serwist'
import { Serwist } from 'serwist'

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
  runtimeCaching: defaultCache,

  /**
   * Rotas que o service worker NUNCA intercepta.
   *
   * `/convite/*` carrega o token na URL. Interceptar guardaria essa resposta
   * no CacheStorage indexada pelo caminho com o token — num tablet
   * compartilhado, legível por qualquer um depois, e por XSS.
   *
   * `/auth/*` troca código por sessão; cache ali é resposta de autenticação
   * guardada, que é a mesma classe de erro.
   */
  navigationPreload: true,
})

serwist.addEventListeners()
