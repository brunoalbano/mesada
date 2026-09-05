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
          // O token do convite nunca deve vazar para terceiros pelo Referer.
          { key: 'Referrer-Policy', value: 'no-referrer' },
          {
            // Encarece XSS, que é o cenário citado no desenho: script injetado
            // lendo dado de família. `unsafe-inline` em script fica por
            // enquanto — o Next injeta scripts inline sem nonce na
            // renderização estática, e prometer proteção que não existe é
            // pior do que declarar o buraco.
            key: 'Content-Security-Policy',
            value: [
              "default-src 'self'",
              "script-src 'self' 'unsafe-inline' 'unsafe-eval'",
              "style-src 'self' 'unsafe-inline'",
              "img-src 'self' data: blob:",
              "font-src 'self' data:",
              // Só o próprio Supabase: sem isto, um script injetado exfiltra
              // para qualquer domínio.
              `connect-src 'self' ${process.env.NEXT_PUBLIC_SUPABASE_URL ?? ''} wss://${
                process.env.NEXT_PUBLIC_SUPABASE_URL?.replace('https://', '') ?? ''
              }`.trim(),
              "frame-ancestors 'none'",
              "base-uri 'self'",
              "form-action 'self'",
              "object-src 'none'",
            ].join('; '),
          },
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'X-Frame-Options', value: 'DENY' },
        ],
      },
    ]
  },
}

export default withSerwist(withNextIntl(config))
