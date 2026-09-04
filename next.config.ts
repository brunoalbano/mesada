import createNextIntlPlugin from 'next-intl/plugin'
import type { NextConfig } from 'next'

// Sem roteamento por idioma: nada de /pt ou /en na URL. O link da criança
// precisa ser curto e estável, e o start_url do PWA é fixo.
const withNextIntl = createNextIntlPlugin('./i18n/request.ts')

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

export default withNextIntl(config)
