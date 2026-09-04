import createNextIntlPlugin from 'next-intl/plugin'
import withSerwistInit from '@serwist/next'
import type { NextConfig } from 'next'

// Sem roteamento por idioma: nada de /pt ou /en na URL. O link da criança
// precisa ser curto e estável, e o start_url do PWA é fixo.
const withNextIntl = createNextIntlPlugin('./i18n/request.ts')

const withSerwist = withSerwistInit({
  swSrc: 'app/sw.ts',
  // O worker roda em WebWorker, não no DOM: tem tsconfig próprio.
  additionalPrecacheEntries: [],
  swDest: 'public/sw.js',
  // Nada de service worker em desenvolvimento: cache atrapalha o laço rápido,
  // e um worker antigo servindo página velha é dor de cabeça difícil de ver.
  disable: process.env.NODE_ENV === 'development',
  // O token de convite viaja na URL. Se o worker interceptasse essas rotas, a
  // resposta ficaria no CacheStorage indexada pelo caminho com o token.
  exclude: [/^\/convite\//, /^\/auth\//],
})

const config: NextConfig = {
  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          // O token do link nunca deve vazar para terceiros pelo Referer.
          { key: 'Referrer-Policy', value: 'no-referrer' },
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'X-Frame-Options', value: 'DENY' },
        ],
      },
    ]
  },
}

export default withSerwist(withNextIntl(config))
